// L'œil : machine d'état de référence (pure, sans dépendance, testable).
// Transforme les événements serveur en ce que l'œil affiche : état, outil, libellé, modificateurs.
//
// Adapte les payloads réels d'OpenCode au type EyeEvent ci-dessous (noms d'événements sans le préfixe « session. »).
// Appelle dispatch() à chaque événement, et tick() régulièrement (toutes les 100 ms environ) :
// le temps minimum par état, le délai avant réflexion, les durées des réactions et les modificateurs
// se résolvent avec le temps, même sans nouvel événement.

export type ToolKind = 'read' | 'write' | 'shell' | 'delegate' | 'web' | 'plan' | 'generic';

export type EyeState =
  | 'idle' | 'think' | 'respond'
  | ToolKind
  | 'attention' | 'sleep'
  | 'error-flash' | 'error' | 'error-spiral'
  | 'happy' | 'vexed' | 'surprised';

export type EyeEvent =
  | { type: 'execution.started' }
  | { type: 'step.started' }
  | { type: 'reasoning.started' }
  | { type: 'text.started' }
  | { type: 'tool.input.started'; callId: string; tool: string; innerTool?: string }
  | { type: 'tool.called'; callId: string; tool: string; innerTool?: string }
  | { type: 'tool.success'; callId: string }
  | { type: 'tool.failed'; callId: string; aborted?: boolean }
  | { type: 'permission.asked'; id: string }
  | { type: 'permission.replied'; id: string; rejected?: boolean }
  | { type: 'form.created'; id: string }
  | { type: 'form.replied'; id: string }
  | { type: 'form.cancelled'; id: string }
  | { type: 'compaction.started' }
  | { type: 'compaction.ended' }
  | { type: 'compaction.failed'; aborted?: boolean }
  | { type: 'step.failed'; aborted?: boolean }
  | { type: 'execution.failed'; aborted?: boolean }
  | { type: 'execution.succeeded' }
  | { type: 'execution.interrupted' }
  | { type: 'prompt.sent' }                              // nouveau prompt de l'utilisateur
  | { type: 'window.visible'; awayMs: number }           // côté client : visibilitychange
  | { type: 'context.usage'; ratio: number };            // 0…1, si l'information est disponible

export interface ActiveTool { callId: string; name: string; kind: ToolKind; since: number }
export interface Mods { impatient: boolean; bored: boolean; tired: boolean }
export interface Transition { at: number; label: string; event: string }

export interface EyeView {
  state: EyeState;
  tool: ActiveTool | null;   // outil affiché dans le badge
  count: number;             // nombre d'outils en cours (badge ×N si > 1)
  label: string;             // libellé de la barre d'état
  mods: Mods;
  since: number;             // début de l'état affiché (pour la carte de détails)
  history: Transition[];     // transitions récentes, la plus récente en premier
}

export interface EyeOptions {
  minDwellMs: number; thinkDelayMs: number; flashMs: number;
  happyMs: number; vexedMs: number; surprisedMs: number; surprisedAwayMs: number;
  impatientMs: number; boredMs: number; tiredRatio: number;
}

export const DEFAULT_OPTIONS: EyeOptions = {
  minDwellMs: 400,       // temps minimum d'affichage d'un état
  thinkDelayMs: 250,     // délai avant de passer d'un outil à « réfléchit »
  flashMs: 1500,         // éclair d'erreur (tool.failed)
  happyMs: 1100,
  vexedMs: 1300,
  surprisedMs: 1200,
  surprisedAwayMs: 30_000,
  impatientMs: 15_000,
  boredMs: 120_000,
  tiredRatio: 0.8,
};

// ---------------------------------------------------------------------------
// Classification des outils

const TOOL_KINDS: Record<string, ToolKind> = {
  read: 'read', grep: 'read', glob: 'read', search: 'read', list: 'read', ls: 'read', find: 'read', codesearch: 'read',
  patch: 'write', apply_patch: 'write', edit: 'write', multiedit: 'write', write: 'write',
  shell: 'shell', bash: 'shell', terminal: 'shell',
  task: 'delegate', subagent: 'delegate',
  webfetch: 'web', websearch: 'web',
  todowrite: 'plan', todoread: 'plan',
};

export function classifyTool(name: string): ToolKind {
  return TOOL_KINDS[name.toLowerCase()] ?? 'generic';
}

/** Ordre d'affichage quand plusieurs outils tournent en parallèle (le plus « intense » d'abord). */
const TOOL_PRIORITY: ToolKind[] = ['write', 'shell', 'delegate', 'read', 'web', 'plan', 'generic'];
const TOOL_STATES = new Set<EyeState>(TOOL_PRIORITY);

const VERB: Record<ToolKind, string> = {
  read: 'Lit', write: 'Écrit', shell: 'Lance une commande', generic: 'Utilise un outil',
  delegate: 'Délègue', web: 'Cherche sur le web', plan: 'Planifie',
};

const LABEL: Partial<Record<EyeState, string>> = {
  idle: 'Au repos', think: 'Réfléchit', respond: 'Répond',
  attention: "T'attend", sleep: 'Compacte la conversation',
  'error-flash': 'Quelque chose a échoué', error: 'Quelque chose a échoué', 'error-spiral': 'Quelque chose a échoué',
  happy: 'Terminé', vexed: 'Interrompu', surprised: 'Te revoilà',
};

const isReaction = (s: EyeState) => s === 'happy' || s === 'vexed' || s === 'surprised';
const isError = (s: EyeState) => s === 'error-flash' || s === 'error' || s === 'error-spiral';

// ---------------------------------------------------------------------------

type ErrorInfo =
  | { state: 'error-flash'; until: number }
  | { state: 'error'; clearOn: 'step' | 'compaction-or-prompt' }
  | { state: 'error-spiral'; clearOn: 'prompt' };

export class EyeStateMachine {
  private o: EyeOptions;

  // modèle
  private activity: 'idle' | 'think' | 'respond' = 'idle';
  private tools = new Map<string, ActiveTool>();
  private waits = new Set<string>();
  private compacting = false;
  private error: ErrorInfo | null = null;
  private reaction: { state: 'happy' | 'vexed' | 'surprised'; until: number } | null = null;
  private lastEventAt: number;
  private contextRatio = 0;
  private lastEventName = '—';

  // affichage
  private shown: EyeState = 'idle';
  private shownTool: ActiveTool | null = null;
  private shownSince: number;
  private thinkPendingSince: number | null = null;
  private history: Transition[] = [];

  constructor(options: Partial<EyeOptions> = {}, now = Date.now()) {
    this.o = { ...DEFAULT_OPTIONS, ...options };
    this.lastEventAt = now;
    this.shownSince = now - this.o.minDwellMs; // le premier changement d'état passe sans attendre
  }

  dispatch(ev: EyeEvent, now = Date.now()): EyeView {
    this.apply(ev, now);
    this.lastEventName = ev.type;
    return this.tick(now);
  }

  tick(now = Date.now()): EyeView {
    const cand = this.candidate(now);
    let next = cand.state;
    let nextTool = cand.tool;

    const urgent = next === 'attention' || next === 'sleep' || isError(next) || isReaction(next);

    // Délai avant « réfléchit » quand on sort d'un outil : un outil qui suit de près évite le passage par think.
    if (next === 'think' && TOOL_STATES.has(this.shown)) {
      if (this.thinkPendingSince === null) this.thinkPendingSince = now;
      if (now - this.thinkPendingSince < this.o.thinkDelayMs) { next = this.shown; nextTool = this.shownTool; }
    } else {
      this.thinkPendingSince = null;
    }

    const changed = next !== this.shown || (nextTool?.callId ?? null) !== (this.shownTool?.callId ?? null);
    if (changed) {
      // Les états à durée fixe (réactions, éclair) cèdent la place sans attendre le temps minimum.
      const leavingTransient = isReaction(this.shown) || this.shown === 'error-flash';
      const dwellOk = now - this.shownSince >= this.o.minDwellMs;
      if (urgent || leavingTransient || dwellOk) {
        const stateChanged = next !== this.shown;
        this.shown = next;
        this.shownTool = nextTool;
        if (stateChanged) this.shownSince = now;
        this.history.unshift({ at: now, label: this.labelFor(next, nextTool, false), event: this.lastEventName });
        if (this.history.length > 20) this.history.length = 20;
      }
    }

    const mods: Mods = {
      impatient: !!this.shownTool && TOOL_STATES.has(this.shown) && now - this.shownTool.since > this.o.impatientMs,
      bored: this.shown === 'idle' && now - this.lastEventAt > this.o.boredMs,
      tired: this.contextRatio > this.o.tiredRatio,
    };

    return {
      state: this.shown,
      tool: TOOL_STATES.has(this.shown) ? this.shownTool : null,
      count: TOOL_STATES.has(this.shown) ? Math.max(1, this.tools.size) : 0,
      label: this.labelFor(this.shown, this.shownTool, mods.impatient, mods.bored),
      mods,
      since: this.shownSince,
      history: this.history.slice(0, 5),
    };
  }

  // -------------------------------------------------------------------------

  private labelFor(state: EyeState, tool: ActiveTool | null, impatient: boolean, bored = false): string {
    if (TOOL_STATES.has(state) && tool) return `${VERB[tool.kind]} · ${tool.name}${impatient ? ' · ça traîne' : ''}`;
    if (state === 'idle' && bored) return "S'ennuie";
    return LABEL[state] ?? state;
  }

  private react(state: 'happy' | 'vexed' | 'surprised', now: number) {
    const ms = state === 'happy' ? this.o.happyMs : state === 'vexed' ? this.o.vexedMs : this.o.surprisedMs;
    this.reaction = { state, until: now + ms };
  }

  private pickTool(): ActiveTool | null {
    let best: ActiveTool | null = null;
    for (const t of this.tools.values()) {
      if (!best) { best = t; continue; }
      const a = TOOL_PRIORITY.indexOf(t.kind), b = TOOL_PRIORITY.indexOf(best.kind);
      if (a < b || (a === b && t.since > best.since)) best = t;
    }
    return best;
  }

  private candidate(now: number): { state: EyeState; tool: ActiveTool | null } {
    if (this.error?.state === 'error-flash' && now >= this.error.until) this.error = null;
    if (this.reaction && now >= this.reaction.until) this.reaction = null;

    if (this.waits.size) return { state: 'attention', tool: null };
    if (this.compacting) return { state: 'sleep', tool: null };
    if (this.error) return { state: this.error.state, tool: null };
    if (this.reaction) return { state: this.reaction.state, tool: null };
    const t = this.pickTool();
    if (t) return { state: t.kind, tool: t };
    return { state: this.activity, tool: null };
  }

  private apply(ev: EyeEvent, now: number) {
    if (ev.type !== 'window.visible' && ev.type !== 'context.usage') this.lastEventAt = now;

    switch (ev.type) {
      case 'execution.started':
      case 'reasoning.started':
        this.activity = 'think';
        break;
      case 'step.started':
        this.activity = 'think';
        if (this.error?.state === 'error' && this.error.clearOn === 'step') this.error = null;
        break;
      case 'text.started':
        this.activity = 'respond';
        break;

      case 'tool.input.started': {
        const name = ev.innerTool ?? ev.tool;
        this.tools.set(ev.callId, { callId: ev.callId, name, kind: classifyTool(name), since: now });
        break;
      }
      case 'tool.called': {
        const existing = this.tools.get(ev.callId);
        if (!existing) {
          // L'œil a raté le début : outil générique, avec son nom en libellé.
          this.tools.set(ev.callId, { callId: ev.callId, name: ev.innerTool ?? ev.tool, kind: 'generic', since: now });
        } else if (ev.innerTool) {
          // execute : le nom de l'outil interne peut n'arriver qu'ici.
          existing.name = ev.innerTool;
          existing.kind = classifyTool(ev.innerTool);
        }
        break;
      }
      case 'tool.success':
        this.tools.delete(ev.callId);
        if (!this.tools.size) this.activity = 'think';
        break;
      case 'tool.failed':
        this.tools.delete(ev.callId);
        if (ev.aborted) this.react('vexed', now);
        else if (!this.error || this.error.state === 'error-flash') this.error = { state: 'error-flash', until: now + this.o.flashMs };
        if (!this.tools.size) this.activity = 'think';
        break;

      case 'permission.asked':
      case 'form.created':
        this.waits.add(ev.id);
        break;
      case 'permission.replied':
        this.waits.delete(ev.id);
        if (ev.rejected) this.react('vexed', now);
        break;
      case 'form.replied':
      case 'form.cancelled':
        this.waits.delete(ev.id);
        break;

      case 'compaction.started':
        this.compacting = true;
        if (this.error?.state === 'error' && this.error.clearOn === 'compaction-or-prompt') this.error = null;
        break;
      case 'compaction.ended':
        this.compacting = false;
        break;
      case 'compaction.failed':
        this.compacting = false;
        if (ev.aborted) this.react('vexed', now);
        else this.error = { state: 'error', clearOn: 'compaction-or-prompt' };
        break;

      case 'step.failed':
        if (ev.aborted) this.react('vexed', now);
        else if (this.error?.state !== 'error-spiral') this.error = { state: 'error', clearOn: 'step' };
        break;
      case 'execution.failed':
        this.tools.clear();
        this.waits.clear();
        this.activity = 'idle';
        if (ev.aborted) this.react('vexed', now);
        else this.error = { state: 'error-spiral', clearOn: 'prompt' };
        break;
      case 'execution.succeeded':
        this.tools.clear();
        this.waits.clear();
        this.activity = 'idle';
        this.react('happy', now);
        break;
      case 'execution.interrupted':
        this.tools.clear();
        this.waits.clear();
        this.activity = 'idle';
        this.react('vexed', now);
        break;

      case 'prompt.sent':
        if (this.error && this.error.state !== 'error-flash' && (this.error.clearOn === 'prompt' || this.error.clearOn === 'compaction-or-prompt')) {
          this.error = null;
        }
        break;
      case 'window.visible':
        if (ev.awayMs >= this.o.surprisedAwayMs) this.react('surprised', now);
        break;
      case 'context.usage':
        this.contextRatio = ev.ratio;
        break;
    }
  }
}
