'use client';

import { useState, useTransition } from 'react';
import type {
  ConfigField,
  ConfigIssue,
  ConfigGroup,
  GuildChannel,
  GuildRole,
  ModuleAction,
} from '@/lib/botApi';
import type { SaveResult } from '@/lib/botApi';
import type { Translate } from '@/lib/i18n';
import { useT } from '@/components/I18n';
import { publishAction, runModuleActionAction, saveConfigAction } from '../actions';

type Values = Record<string, unknown>;

/** Salons pertinents pour un type de champ donné. */
function channelsFor(type: ConfigField['type'], channels: GuildChannel[]): GuildChannel[] {
  if (type === 'voiceChannel') return channels.filter((c) => c.type === 2);
  if (type === 'category') return channels.filter((c) => c.type === 4);
  // 'channel' / 'channels' : salons textuels (texte, annonces, forum)
  return channels.filter((c) => c.type === 0 || c.type === 5 || c.type === 15);
}

/** Valeur par défaut d'un champ (pour initialiser une nouvelle ligne de liste). */
function defaultForField(field: ConfigField): unknown {
  switch (field.type) {
    case 'boolean':
      return false;
    case 'number':
      return 0;
    case 'channels':
    case 'roles':
    case 'multiselect':
    case 'tags':
    case 'list':
      return [];
    case 'channel':
    case 'voiceChannel':
    case 'category':
    case 'role':
      return null;
    case 'select':
      return field.options?.[0]?.value ?? '';
    default:
      return '';
  }
}

/** Lit une valeur via une clé éventuellement « pointée » (ex. `schedule.type`). */
function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

/** Écrit (immutablement) une valeur via une clé « pointée ». */
function setPath(obj: Record<string, unknown>, path: string, val: unknown): Record<string, unknown> {
  const [head, ...rest] = path.split('.');
  if (rest.length === 0) return { ...obj, [head]: val };
  const child =
    obj[head] && typeof obj[head] === 'object' ? (obj[head] as Record<string, unknown>) : {};
  return { ...obj, [head]: setPath(child, rest.join('.'), val) };
}

/** Nouvelle ligne d'une liste : sous-champs par défaut + identifiant auto. */
function newRow(field: ConfigField): Record<string, unknown> {
  let row: Record<string, unknown> = {};
  for (const sub of field.item ?? []) {
    row = setPath(row, sub.key, sub.default ?? defaultForField(sub));
  }
  if (field.idKey) {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`;
    row = setPath(row, field.idKey, id.replace(/-/g, '').slice(0, 12));
  }
  return row;
}

/** Switch 44×25 : piste accent/track, knob blanc glissant. */
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className="relative h-[25px] w-[44px] shrink-0 rounded-full transition-colors"
      style={{ background: value ? 'var(--acc)' : 'var(--track)' }}
    >
      <span
        className="absolute top-[3px] h-[19px] w-[19px] rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,.35)] transition-[left] duration-200"
        style={{ left: value ? '22px' : '3px' }}
      />
    </button>
  );
}

/** Saisie de valeurs libres sous forme de puces (emojis, mots-clés…). */
function TagsInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft('');
  };
  return (
    <div>
      {value.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--bd)] bg-[var(--surf)] px-[10px] py-1 text-[13px] text-[var(--tx)]"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="text-[var(--mut)] transition-colors hover:text-[#fca5a5]"
                aria-label={t('dashboard.module.retirer')}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder ?? t('dashboard.module.saisirEntree')}
          className="field"
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 rounded-[10px] border border-[var(--acc-bd)] px-4 text-[14px] font-semibold text-[var(--acc2)] transition-colors hover:bg-[var(--acc-bg)]"
        >
          {t('dashboard.module.ajouter')}
        </button>
      </div>
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
  channels,
  roles,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
  channels: GuildChannel[];
  roles: GuildRole[];
}) {
  const { t } = useT();
  switch (field.type) {
    case 'boolean':
      return <Toggle value={value === true} onChange={onChange} />;

    case 'textarea':
      return (
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="field resize-y"
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={typeof value === 'number' ? value : 0}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className="field"
        />
      );

    case 'channel':
    case 'voiceChannel':
    case 'category': {
      const opts = channelsFor(field.type, channels);
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
          className="field"
        >
          <option value="">{t('dashboard.module.aucun')}</option>
          {opts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      );
    }

    case 'role':
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
          className="field"
        >
          <option value="">{t('dashboard.module.aucun')}</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      );

    case 'channels':
    case 'roles': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const opts =
        field.type === 'channels'
          ? channelsFor('channels', channels).map((c) => ({ id: c.id, name: c.name }))
          : roles.map((r) => ({ id: r.id, name: r.name }));
      const toggle = (id: string) =>
        onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
      return (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-[10px] border border-[var(--bd)] bg-[var(--surf)] p-2">
          {opts.length === 0 ? (
            <p className="px-1 py-2 text-[14px] text-[var(--muted2)]">
              {t('dashboard.module.aucunElement')}
            </p>
          ) : (
            opts.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1 text-[14px] text-[var(--tx)] hover:bg-[var(--surf-hover)]"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o.id)}
                  onChange={() => toggle(o.id)}
                  className="accent-[var(--acc)]"
                />
                {o.name}
              </label>
            ))
          )}
        </div>
      );
    }

    case 'select':
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="field"
        >
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );

    case 'multiselect': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (id: string) =>
        onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
                  on
                    ? 'border-[var(--acc)] bg-[var(--acc-bg)] text-[var(--tx)]'
                    : 'border-[var(--bd)] text-[var(--mut)] hover:border-[var(--acc-bd)]'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }

    case 'tags':
      return (
        <TagsInput
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          placeholder={field.placeholder}
        />
      );

    case 'list':
      return (
        <ListEditor field={field} value={value} onChange={onChange} channels={channels} roles={roles} />
      );

    case 'color':
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#5865F2"
          className="field"
        />
      );

    case 'text':
    default:
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="field"
        />
      );
  }
}

/** Éditeur de liste répétable : ajout/suppression de lignes d'objets. */
function ListEditor({
  field,
  value,
  onChange,
  channels,
  roles,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
  channels: GuildChannel[];
  roles: GuildRole[];
}) {
  const { t } = useT();
  const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const subFields = field.item ?? [];

  const updateRow = (index: number, key: string, v: unknown) =>
    onChange(rows.map((r, i) => (i === index ? setPath(r, key, v) : r)));
  const addRow = () => onChange([...rows, newRow(field)]);
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-[14px] text-[var(--muted2)]">{t('dashboard.module.aucuneEntree')}</p>
      ) : null}
      {rows.map((row, i) => {
        const rowKey =
          field.idKey && typeof row[field.idKey] === 'string' ? (row[field.idKey] as string) : i;
        return (
          <div key={rowKey} className="rounded-[12px] border border-[var(--bd)] bg-[var(--surf)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                {subFields.map((sub) => (
                  <div key={sub.key}>
                    <label className="mb-1 block text-[12px] font-medium text-[var(--tx)]">
                      {sub.label}
                    </label>
                    <Field
                      field={sub}
                      value={getPath(row, sub.key)}
                      onChange={(v) => updateRow(i, sub.key, v)}
                      channels={channels}
                      roles={roles}
                    />
                    {sub.help ? (
                      <p className="mt-1 text-[12px] text-[var(--muted2)]">{sub.help}</p>
                    ) : null}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="shrink-0 rounded-[8px] border border-[var(--bd)] px-2 py-1 text-[12px] text-[var(--mut)] transition-colors hover:border-[rgba(248,113,113,.5)] hover:text-[#fca5a5]"
              >
                {t('dashboard.module.supprimer')}
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addRow}
        className="rounded-[10px] border border-[var(--acc-bd)] px-3 py-[7px] text-[14px] font-semibold text-[var(--acc2)] transition-colors hover:bg-[var(--acc-bg)]"
      >
        + {field.addLabel ?? t('dashboard.module.ajouter')}
      </button>
    </div>
  );
}

/**
 * Message d'échec d'un enregistrement. Un refus du bot (HTTP 4xx) n'est pas une
 * panne réseau : quand il refuse sans détailler, c'est le plus souvent qu'il
 * tourne une version antérieure aux retours de validation.
 */
function saveErrorMessage(t: Translate, result: Extract<SaveResult, { ok: false }>): string {
  if (result.reason === 'unreachable') return t('dashboard.module.injoignable');
  if (result.issues.length > 0) return t('dashboard.module.refuse');
  return t('dashboard.module.refuseSansDetail', { statut: result.status });
}

/** Classes du bouton d'une action, selon son style déclaré par le bot. */
function actionButtonClass(style: ModuleAction['style']): string {
  const base =
    'rounded-[10px] px-4 py-[9px] text-[14px] font-semibold transition-colors disabled:opacity-50';
  if (style === 'primary') return `${base} bg-[var(--acc)] text-white hover:brightness-110`;
  if (style === 'danger')
    return `${base} border border-[rgba(248,113,113,.5)] text-[#fca5a5] hover:bg-[rgba(248,113,113,.08)]`;
  return `${base} border border-[var(--bd)] text-[var(--tx)] hover:border-[var(--acc-bd)]`;
}

/**
 * Une action de module : ses champs éventuels, son bouton, et le retour du bot.
 * Chaque action garde sa propre saisie et son propre message.
 */
function ActionCard({
  guildId,
  moduleName,
  action,
  channels,
  roles,
}: {
  guildId: string;
  moduleName: string;
  action: ModuleAction;
  channels: GuildChannel[];
  roles: GuildRole[];
}) {
  const { t } = useT();
  const fields = action.fields ?? [];
  const [input, setInput] = useState<Values>(() => {
    let initial: Record<string, unknown> = {};
    for (const field of fields) {
      initial = setPath(initial, field.key, field.default ?? defaultForField(field));
    }
    return initial;
  });
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const run = () => {
    if (action.confirm && !window.confirm(action.confirm)) return;
    setResult(null);
    startTransition(async () => {
      const res = await runModuleActionAction(guildId, moduleName, action.id, input);
      setResult({
        ok: res.ok,
        text:
          res.message ??
          (res.ok ? t('dashboard.module.actionOk') : t('dashboard.module.actionEchouee')),
      });
    });
  };

  return (
    <div className="rounded-[12px] border border-[var(--bd)] bg-[var(--surf)] p-4">
      <p className="text-[14px] font-semibold text-[var(--tx)]">{action.label}</p>
      {action.help ? <p className="mt-1 text-[13px] text-[var(--mut)]">{action.help}</p> : null}

      {fields.length > 0 ? (
        <div className="mt-3 space-y-3">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="mb-1 block text-[12px] font-medium text-[var(--tx)]">
                {field.label}
              </label>
              <Field
                field={field}
                value={getPath(input, field.key)}
                onChange={(v) => setInput((prev) => setPath(prev, field.key, v))}
                channels={channels}
                roles={roles}
              />
              {field.help ? (
                <p className="mt-1 text-[12px] text-[var(--muted2)]">{field.help}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className={actionButtonClass(action.style)}
        >
          {pending ? t('dashboard.module.patiente') : action.label}
        </button>
        {result ? (
          <span className="text-[13px] text-[var(--tx)]">
            {result.ok ? '✅' : '❌'} {result.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Rangée : booléens à droite (compact), autres champs empilés. */
function FieldRow({
  field,
  value,
  onChange,
  channels,
  roles,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
  channels: GuildChannel[];
  roles: GuildRole[];
}) {
  if (field.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-4 py-3">
        <div>
          <p className="text-[14px] font-medium text-[var(--tx)]">{field.label}</p>
          {field.help ? <p className="mt-[2px] text-[12px] text-[var(--mut)]">{field.help}</p> : null}
        </div>
        <Field field={field} value={value} onChange={onChange} channels={channels} roles={roles} />
      </div>
    );
  }
  return (
    <div className="py-3">
      <label className="mb-[6px] block text-[14px] font-medium text-[var(--tx)]">{field.label}</label>
      <Field field={field} value={value} onChange={onChange} channels={channels} roles={roles} />
      {field.help ? <p className="mt-[6px] text-[12px] text-[var(--mut)]">{field.help}</p> : null}
    </div>
  );
}

export function ModuleForm({
  guildId,
  moduleName,
  enabled,
  config,
  groups,
  channels,
  roles,
  publishable,
  actions,
}: {
  guildId: string;
  moduleName: string;
  enabled: boolean;
  config: Record<string, unknown>;
  groups: ConfigGroup[];
  channels: GuildChannel[];
  roles: GuildRole[];
  publishable: boolean;
  actions: ModuleAction[];
}) {
  // On repart de la config complète pour préserver les champs non exposés.
  const [values, setValues] = useState<Values>(() => structuredClone(config));
  const [pending, startTransition] = useTransition();
  const { t } = useT();
  const [message, setMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<ConfigIssue[]>([]);

  // Onglets : une page de module empile parfois six sections, ce qui fait un
  // long déroulé où l'on cherche son réglage. Un seul groupe ne mérite pas
  // d'onglet — la barre serait un ornement.
  const tabs: { id: string; label: string }[] = [
    ...groups.map((group, index) => ({
      id: group.key ?? `g${index}`,
      label: group.label ?? t('dashboard.module.groupeParDefaut'),
    })),
    ...(actions.length > 0
      ? [{ id: '__actions', label: t('dashboard.module.actions') }]
      : []),
  ];
  const [tab, setTab] = useState<string>(tabs[0]?.id ?? '');
  const showTabs = tabs.length > 1;

  /**
   * À quel onglet appartient un champ refusé ?
   *
   * Le bot renvoie un chemin (`weights.top`, `poolTopRank`). Un groupe nommé
   * possède les chemins commençant par sa clé ; le groupe racine possède les
   * clés nues. Sans ce rattachement, une erreur portant sur un onglet masqué
   * s'afficherait sans que le champ fautif soit visible nulle part.
   */
  const tabOfPath = (path: string): string | null => {
    const [head] = path.split('.');
    for (const [index, group] of groups.entries()) {
      const id = group.key ?? `g${index}`;
      if (group.key ? group.key === head : group.fields.some((f) => f.key === head)) return id;
    }
    return null;
  };
  const failingTabs = new Set(issues.map((issue) => tabOfPath(issue.path)).filter(Boolean));

  const getValue = (groupKey: string | undefined, key: string): unknown => {
    if (groupKey) {
      const sub = values[groupKey];
      return sub && typeof sub === 'object' ? (sub as Values)[key] : undefined;
    }
    return values[key];
  };

  const setValue = (groupKey: string | undefined, key: string, v: unknown) => {
    setMessage(null);
    setIssues([]);
    setValues((prev) => {
      if (groupKey) {
        const sub = (prev[groupKey] && typeof prev[groupKey] === 'object'
          ? (prev[groupKey] as Values)
          : {}) as Values;
        return { ...prev, [groupKey]: { ...sub, [key]: v } };
      }
      return { ...prev, [key]: v };
    });
  };

  const save = () => {
    startTransition(async () => {
      const res = await saveConfigAction(guildId, moduleName, values);
      const nextIssues = res.ok || res.reason === 'unreachable' ? [] : res.issues;
      setIssues(nextIssues);
      // Basculer sur le premier onglet fautif : un refus qui pointe un champ
      // invisible n'aide personne.
      const failing = nextIssues[0] ? tabOfPath(nextIssues[0].path) : null;
      if (failing) setTab(failing);
      setMessage(res.ok ? t('dashboard.module.enregistre') : saveErrorMessage(t, res));
    });
  };

  // Enregistre puis (re)publie le panneau, pour que le message reflète l'édition.
  const saveAndPublish = () => {
    startTransition(async () => {
      const saved = await saveConfigAction(guildId, moduleName, values);
      const nextIssues = saved.ok || saved.reason === 'unreachable' ? [] : saved.issues;
      setIssues(nextIssues);
      const failing = nextIssues[0] ? tabOfPath(nextIssues[0].path) : null;
      if (failing) setTab(failing);
      if (!saved.ok) {
        setMessage(saveErrorMessage(t, saved));
        return;
      }
      const pub = await publishAction(guildId, moduleName);
      setMessage(
        pub.ok ? t('dashboard.module.publie') : t('dashboard.module.publicationEchouee'),
      );
    });
  };

  return (
    <div className="space-y-6">
      {!enabled ? (
        <div className="rounded-[16px] border border-amber-500/30 bg-amber-500/5 p-4 text-[14px] text-[var(--mut)]">
          {t('dashboard.module.desactiveAvis')}
        </div>
      ) : null}

      {showTabs ? (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('dashboard.module.sections')}>
          {tabs.map((entry) => {
            const active = entry.id === tab;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(entry.id)}
                className={`flex items-center gap-2 rounded-[10px] border px-[14px] py-[8px] text-[14px] font-semibold transition-colors ${
                  active
                    ? 'border-[var(--acc-bd)] bg-[var(--acc-bg)] text-[var(--tx)]'
                    : 'border-[var(--bd)] bg-[var(--surf)] text-[var(--mut)] hover:text-[var(--tx)]'
                }`}
              >
                {entry.label}
                {failingTabs.has(entry.id) ? (
                  <span
                    aria-label={t('dashboard.module.champRefuse')}
                    className="h-[7px] w-[7px] rounded-full bg-[#f87171]"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {groups.map((group, gi) => (
        <section
          key={group.key ?? `g${gi}`}
          className="card p-6"
          hidden={showTabs && tab !== (group.key ?? `g${gi}`)}
        >
          {group.label ? (
            <h2 className="font-display text-[18px] font-semibold text-[var(--tx)]">{group.label}</h2>
          ) : null}
          {group.description ? (
            <p className="mt-1 text-[14px] text-[var(--mut)]">{group.description}</p>
          ) : null}
          <div className="mt-2 divide-y divide-[var(--bd)]">
            {group.fields.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                value={getValue(group.key, field.key)}
                onChange={(v) => setValue(group.key, field.key, v)}
                channels={channels}
                roles={roles}
              />
            ))}
          </div>
        </section>
      ))}

      {actions.length > 0 ? (
        <section className="card p-6" hidden={showTabs && tab !== '__actions'}>
          <h2 className="font-display text-[18px] font-semibold text-[var(--tx)]">
            {t('dashboard.module.actions')}
          </h2>
          <p className="mt-1 text-[14px] text-[var(--mut)]">{t('dashboard.module.actionsAide')}</p>
          <div className="mt-4 space-y-3">
            {actions.map((action) => (
              <ActionCard
                key={action.id}
                guildId={guildId}
                moduleName={moduleName}
                action={action}
                channels={channels}
                roles={roles}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-[10px] bg-[var(--acc)] px-5 py-[11px] text-[14px] font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50"
        >
          {pending ? t('dashboard.module.enregistrement') : t('dashboard.module.enregistrer')}
        </button>
        {publishable ? (
          <button
            type="button"
            onClick={saveAndPublish}
            disabled={pending}
            className="rounded-[10px] border border-[var(--acc-bd)] px-5 py-[11px] text-[14px] font-semibold text-[var(--acc2)] transition-colors hover:bg-[var(--acc-bg)] disabled:opacity-50"
          >
            {pending
              ? t('dashboard.module.patiente')
              : t('dashboard.module.enregistrerPublier')}
          </button>
        ) : null}
        {message ? <span className="text-[14px] text-[var(--tx)]">{message}</span> : null}
      </div>
      {issues.length > 0 ? (
        <ul className="rounded-[16px] border border-[rgba(248,113,113,.35)] bg-[rgba(248,113,113,.06)] p-4 text-[13px] text-[var(--tx)]">
          {issues.map((issue) => (
            <li key={`${issue.path}-${issue.message}`} className="py-[2px]">
              <code className="code">{issue.path || t('dashboard.module.configuration')}</code> —{' '}
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
      {publishable ? (
        <p className="text-[12px] text-[var(--muted2)]">{t('dashboard.module.publierAide')}</p>
      ) : null}
    </div>
  );
}
