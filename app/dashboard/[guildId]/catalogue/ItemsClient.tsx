'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type {
  EffectField,
  EffectSpec,
  GuildRole,
  ItemEffect,
  Rarity,
  ShopItem,
  ShopItemInput,
} from '@/lib/botApi';
import {
  createItemAction,
  deleteItemAction,
  setItemLimitAction,
  updateItemAction,
} from '../actions';
import { EmojiPicker } from './EmojiPicker';
import { useT } from '@/components/I18n';

/**
 * L'emoji d'une rareté. Son nom est traduit (`objets.rarete.*`) : la pastille
 * de couleur ne change pas d'une langue à l'autre, le mot si.
 */
const RARITY_META: Record<Rarity, { emoji: string }> = {
  common: { emoji: '⚪' },
  rare: { emoji: '🔵' },
  epic: { emoji: '🟣' },
  legendary: { emoji: '🟠' },
};
const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

const NAME_MAX = 60;
const DESC_MAX = 300;
const PRICE_MAX = 100_000_000;
const PAGE_SIZE = 25;

// --- Effets -----------------------------------------------------------------
// L'éditeur ne connaît aucun type d'effet : le bot sert un descripteur
// (`effectsUI`, cf. `effects-ui.ts` côté bot) décrivant chaque effet et ses
// champs, et tout est rendu à partir de là. Un effet ajouté au bot apparaît
// donc ici sans rien changer.

/** Effet neuf, rempli avec les valeurs par défaut annoncées par le bot. */
function defaultEffect(spec: EffectSpec): ItemEffect {
  const effect: ItemEffect = { type: spec.type };
  for (const field of spec.fields) effect[field.key] = field.default;
  return effect;
}

function parseEffects(item: ShopItem): ItemEffect[] {
  let arr: ItemEffect[] = [];
  try {
    const raw = JSON.parse(item.effects || '[]');
    if (Array.isArray(raw)) arr = raw as ItemEffect[];
  } catch {
    arr = [];
  }
  // Rétrocompat : un ancien roleReward devient un effet « rôle ».
  if (arr.length === 0 && item.roleReward) return [{ type: 'role', roleId: item.roleReward }];
  return arr;
}

type Draft = {
  name: string;
  emoji: string;
  description: string;
  rarity: string;
  price: number;
  buyable: boolean;
  tradable: boolean;
  droppable: boolean;
  usable: boolean;
  effects: ItemEffect[];
  consumable: boolean;
  cooldownSeconds: number;
};

const BLANK: Draft = {
  name: '',
  emoji: '📦',
  description: '',
  rarity: 'common',
  price: 0,
  buyable: true,
  tradable: true,
  droppable: false,
  usable: false,
  effects: [],
  consumable: true,
  cooldownSeconds: 0,
};

function draftFromItem(item: ShopItem): Draft {
  return {
    name: item.name,
    emoji: item.emoji,
    description: item.description,
    rarity: item.rarity,
    price: item.price,
    buyable: item.buyable,
    tradable: item.tradable,
    droppable: item.droppable,
    usable: item.usable,
    effects: parseEffects(item),
    consumable: item.consumable,
    cooldownSeconds: item.cooldownSeconds,
  };
}

/** La rareté connue la plus proche : une valeur inattendue retombe sur « commun ». */
function rarityKey(rarity: string): Rarity {
  return (rarity in RARITY_META ? rarity : 'common') as Rarity;
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

function FlagRow({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-[10px]">
      <div>
        <p className="text-[14px] font-medium text-[var(--tx)]">{label}</p>
        <p className="mt-[2px] text-[12px] text-[var(--mut)]">{help}</p>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

/** Entier borné (bornes facultatives), rendu dans la classe `.field`. */
function numberField(
  value: number,
  onChange: (n: number) => void,
  min?: number,
  max?: number,
  className = 'field',
) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const raw = e.target.value === '' ? 0 : Math.trunc(Number(e.target.value));
        let n = Number.isFinite(raw) ? raw : 0;
        if (min !== undefined) n = Math.max(min, n);
        if (max !== undefined) n = Math.min(max, n);
        onChange(n);
      }}
      className={className}
    />
  );
}

/** Largeurs possibles sur la grille de 6 colonnes (classes Tailwind statiques). */
const SPAN_CLASS: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
};

function spanClass(field: EffectField): string {
  const span = Math.trunc(field.span ?? 6);
  return SPAN_CLASS[span] ?? SPAN_CLASS[6];
}

/** Contrôle d'un champ d'effet, choisi d'après le type annoncé par le bot. */
function EffectFieldControl({
  field,
  value,
  onChange,
  roles,
  items,
}: {
  field: EffectField;
  value: unknown;
  onChange: (v: string | number) => void;
  roles: GuildRole[];
  items: ShopItem[];
}) {
  const text = (v: string) => (field.maxLength ? v.slice(0, field.maxLength) : v);

  switch (field.type) {
    case 'role':
    case 'item': {
      const options =
        field.type === 'role'
          ? roles.map((r) => ({ value: r.id, label: r.name }))
          : items.map((i) => ({ value: i.id, label: `${i.emoji} ${i.name}` }));
      return (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className="field"
        >
          <option value="">{field.placeholder ?? '— Choisir —'}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    case 'select':
      return (
        <select
          value={String(value ?? '')}
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
    case 'textarea':
      return (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(text(e.target.value))}
          placeholder={field.placeholder}
          rows={2}
          className="field resize-y"
        />
      );
    case 'text':
      return (
        <input
          value={String(value ?? '')}
          onChange={(e) => onChange(text(e.target.value))}
          placeholder={field.placeholder}
          className="field"
        />
      );
    case 'percent':
    case 'number': {
      const isPercent = field.type === 'percent';
      const min = field.min ?? (isPercent ? 0 : undefined);
      const max = field.max ?? (isPercent ? 100 : undefined);
      const input = numberField(
        Number(value ?? 0),
        onChange,
        min,
        max,
        isPercent ? 'field pr-7' : 'field',
      );
      if (!isPercent) return input;
      return (
        <span className="relative block">
          {input}
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[var(--mut)]">
            %
          </span>
        </span>
      );
    }
  }
}

/** Champs d'un effet, générés depuis sa description. */
function EffectFields({
  spec,
  effect,
  onChange,
  roles,
  items,
}: {
  spec: EffectSpec;
  effect: ItemEffect;
  onChange: (e: ItemEffect) => void;
  roles: GuildRole[];
  items: ShopItem[];
}) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {spec.fields.map((field) => (
        <label
          key={field.key}
          className={`block text-[12px] text-[var(--mut)] ${spanClass(field)}`}
        >
          {field.label}
          <EffectFieldControl
            field={field}
            value={effect[field.key]}
            onChange={(v) => onChange({ ...effect, [field.key]: v })}
            roles={roles}
            items={items}
          />
          {field.help ? (
            <span className="mt-[3px] block text-[11px] text-[var(--muted2)]">{field.help}</span>
          ) : null}
        </label>
      ))}
    </div>
  );
}

/** Éditeur de la liste d'effets d'un objet, piloté par `specs`. */
function EffectsEditor({
  value,
  onChange,
  specs,
  roles,
  items,
}: {
  value: ItemEffect[];
  onChange: (v: ItemEffect[]) => void;
  specs: EffectSpec[];
  roles: GuildRole[];
  items: ShopItem[];
}) {
  const { t } = useT();
  const update = (i: number, e: ItemEffect) => onChange(value.map((v, idx) => (idx === i ? e : v)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, defaultEffect(specs[0])]);

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="text-[13px] text-[var(--muted2)]">
          {t('objets.effets.aucun')}
        </p>
      ) : null}
      {value.map((effect, i) => {
        const spec = specs.find((s) => s.type === effect.type);
        return (
          <div key={i} className="rounded-[12px] border border-[var(--bd)] bg-[var(--surf)] p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <select
                  value={effect.type}
                  onChange={(e) => {
                    const next = specs.find((s) => s.type === e.target.value);
                    if (next) update(i, defaultEffect(next));
                  }}
                  className="field"
                >
                  {/* Effet servi par un bot plus récent : gardé tel quel dans la liste. */}
                  {spec ? null : (
                    <option value={effect.type}>
                      {t('objets.effets.inconnu', { type: effect.type })}
                    </option>
                  )}
                  {specs.map((s) => (
                    <option key={s.type} value={s.type}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {spec ? (
                  <>
                    <p className="text-[12px] text-[var(--muted2)]">
                      {spec.help}
                      {spec.target === 'required' ? t('objets.effets.cibleRequise') : ''}
                      {spec.target === 'option' ? t('objets.effets.cibleFacultative') : ''}
                    </p>
                    <EffectFields
                      spec={spec}
                      effect={effect}
                      onChange={(e) => update(i, e)}
                      roles={roles}
                      items={items}
                    />
                  </>
                ) : (
                  <p className="text-[12px] text-[var(--muted2)]">
                    {t('objets.effets.inconnuAide')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 rounded-[8px] border border-[var(--bd)] px-2 py-1 text-[12px] text-[var(--mut)] transition-colors hover:border-[rgba(248,113,113,.5)] hover:text-[#fca5a5]"
              >
                {t('objets.effets.retirer')}
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={add}
        className="rounded-[10px] border border-[var(--acc-bd)] px-3 py-[7px] text-[14px] font-semibold text-[var(--acc2)] transition-colors hover:bg-[var(--acc-bg)]"
      >
        {t('objets.effets.ajouter')}
      </button>
    </div>
  );
}

function Editor({
  guildId,
  item,
  roles,
  items,
  effectsUI,
  onSaved,
  onDeleted,
  onCancel,
}: {
  guildId: string;
  item: ShopItem | null;
  roles: GuildRole[];
  items: ShopItem[];
  effectsUI: EffectSpec[];
  onSaved: (item: ShopItem) => void;
  onDeleted: (id: string) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState<Draft>(item ? draftFromItem(item) : BLANK);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setMessage(null);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const nameOk = draft.name.trim().length > 0;

  const save = () => {
    if (!nameOk) {
      setMessage(t('objets.editeur.nomObligatoire'));
      return;
    }
    startTransition(async () => {
      const { effects, ...rest } = draft;
      const payload: ShopItemInput = {
        ...rest,
        name: draft.name.trim(),
        effects: JSON.stringify(effects),
      };
      const res = item
        ? await updateItemAction(guildId, item.id, payload)
        : await createItemAction(guildId, payload);
      if (res.ok && res.item) {
        onSaved(res.item);
      } else {
        setMessage(t('objets.editeur.echecEnregistrement'));
      }
    });
  };

  const remove = () => {
    if (!item) return;
    startTransition(async () => {
      const res = await deleteItemAction(guildId, item.id);
      if (res.ok) onDeleted(item.id);
      else setMessage(t('objets.editeur.echecSuppression'));
    });
  };

  // Objets sélectionnables pour l'effet « donner un objet » (pas soi-même).
  const otherItems = items.filter((i) => i.id !== item?.id);

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[18px] font-semibold text-[var(--tx)]">
          {item ? t('objets.editeur.modifier') : t('objets.editeur.nouveau')}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-[13px] text-[var(--mut)] transition-colors hover:text-[var(--tx)]"
        >
          {t('objets.editeur.fermer')}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <div>
          <label className="mb-[6px] block text-[14px] font-medium text-[var(--tx)]">
            {t('objets.editeur.nom')}
          </label>
          <input
            value={draft.name}
            onChange={(e) => set('name', e.target.value.slice(0, NAME_MAX))}
            placeholder={t('objets.editeur.nomExemple')}
            className="field"
          />
        </div>
        <div>
          <label className="mb-[6px] block text-[14px] font-medium text-[var(--tx)]">
            {t('objets.editeur.emoji')}
          </label>
          <EmojiPicker value={draft.emoji} onChange={(v) => set('emoji', v)} placeholder="📦" />
        </div>
      </div>

      <div>
        <label className="mb-[6px] block text-[14px] font-medium text-[var(--tx)]">
          {t('objets.editeur.description')}
        </label>
        <textarea
          value={draft.description}
          onChange={(e) => set('description', e.target.value.slice(0, DESC_MAX))}
          placeholder={t('objets.editeur.descriptionExemple')}
          rows={2}
          className="field resize-y"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-[6px] block text-[14px] font-medium text-[var(--tx)]">
            {t('objets.editeur.rarete')}
          </label>
          <select
            value={draft.rarity}
            onChange={(e) => set('rarity', e.target.value)}
            className="field"
          >
            {RARITY_ORDER.map((r) => (
              <option key={r} value={r}>
                {RARITY_META[r].emoji} {t(`objets.rarete.${r}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-[6px] block text-[14px] font-medium text-[var(--tx)]">
            {t('objets.editeur.prix')}
          </label>
          <input
            type="number"
            min={0}
            max={PRICE_MAX}
            value={draft.price}
            onChange={(e) =>
              set(
                'price',
                e.target.value === ''
                  ? 0
                  : Math.min(PRICE_MAX, Math.max(0, Math.trunc(Number(e.target.value)))),
              )
            }
            className="field"
          />
        </div>
      </div>

      <div className="divide-y divide-[var(--bd)] border-y border-[var(--bd)]">
        <FlagRow
          label={t('objets.editeur.achetable')}
          help={t('objets.editeur.achetableAide')}
          value={draft.buyable}
          onChange={(v) => set('buyable', v)}
        />
        <FlagRow
          label={t('objets.editeur.echangeable')}
          help={t('objets.editeur.echangeableAide')}
          value={draft.tradable}
          onChange={(v) => set('tradable', v)}
        />
        <FlagRow
          label={t('objets.editeur.drop')}
          help={t('objets.editeur.dropAide')}
          value={draft.droppable}
          onChange={(v) => set('droppable', v)}
        />
        <FlagRow
          label={t('objets.editeur.utilisable')}
          help={t('objets.editeur.utilisableAide')}
          value={draft.usable}
          onChange={(v) => set('usable', v)}
        />
      </div>

      {draft.usable ? (
        <div className="space-y-4 rounded-[14px] border border-[var(--acc-bd)] bg-[var(--acc-bg)] p-4">
          <div>
            <p className="text-[14px] font-semibold text-[var(--tx)]">
              {t('objets.editeur.effets')}
            </p>
            <p className="mt-[2px] text-[12px] text-[var(--mut)]">
              {t('objets.editeur.effetsAide')}
            </p>
          </div>
          {effectsUI.length > 0 ? (
            <EffectsEditor
              value={draft.effects}
              onChange={(v) => set('effects', v)}
              specs={effectsUI}
              roles={roles}
              items={otherItems}
            />
          ) : (
            <p className="text-[13px] text-[var(--muted2)]">
              {t('objets.editeur.effetsIndisponibles')}
            </p>
          )}

          <div className="border-t border-[var(--bd)] pt-3">
            <p className="mb-[8px] text-[14px] font-semibold text-[var(--tx)]">
              {t('objets.editeur.aLUsage')}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => set('consumable', true)}
                className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
                  draft.consumable
                    ? 'border-[var(--acc)] bg-[var(--surf)] text-[var(--tx)]'
                    : 'border-[var(--bd)] text-[var(--mut)]'
                }`}
              >
                {t('objets.editeur.consomme')}
              </button>
              <button
                type="button"
                onClick={() => set('consumable', false)}
                className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
                  !draft.consumable
                    ? 'border-[var(--acc)] bg-[var(--surf)] text-[var(--tx)]'
                    : 'border-[var(--bd)] text-[var(--mut)]'
                }`}
              >
                {t('objets.editeur.reutilisable')}
              </button>
            </div>
            {!draft.consumable ? (
              <label className="mt-3 block text-[12px] text-[var(--mut)]">
                {t('objets.editeur.cooldown')}
                <input
                  type="number"
                  min={0}
                  value={draft.cooldownSeconds}
                  onChange={(e) =>
                    set(
                      'cooldownSeconds',
                      e.target.value === '' ? 0 : Math.max(0, Math.trunc(Number(e.target.value))),
                    )
                  }
                  className="field mt-1 w-[180px]"
                />
              </label>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !nameOk}
          className="rounded-[10px] bg-[var(--acc)] px-5 py-[11px] text-[14px] font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50"
        >
          {pending
            ? t('objets.editeur.enregistrement')
            : item
              ? t('objets.editeur.enregistrer')
              : t('objets.editeur.creer')}
        </button>
        {item ? (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="rounded-[10px] border border-[rgba(248,113,113,.4)] px-5 py-[11px] text-[14px] font-semibold text-[#fca5a5] transition-colors hover:bg-[rgba(248,113,113,.08)] disabled:opacity-50"
          >
            {t('objets.editeur.supprimer')}
          </button>
        ) : null}
        {message ? <span className="text-[14px] text-[var(--tx)]">{message}</span> : null}
      </div>
    </div>
  );
}

/**
 * Réglage du plafond GLOBAL d'objets par serveur — visible uniquement pour le
 * propriétaire du bot. « 0 » (ou vide) = illimité.
 */
function LimitControl({
  max,
  onChange,
}: {
  max: number | null;
  onChange: (v: number | null) => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState(max === null ? '' : String(max));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const save = () => {
    const trimmed = draft.trim();
    const n = trimmed === '' ? 0 : Math.max(0, Math.trunc(Number(trimmed)));
    if (!Number.isFinite(n)) {
      setMessage(t('objets.plafond.valeurInvalide'));
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await setItemLimitAction(n === 0 ? null : n);
      if (res.ok) {
        const applied = res.max ?? null;
        onChange(applied);
        setDraft(applied === null ? '' : String(applied));
        setMessage(
          applied === null
            ? t('objets.plafond.fixeIllimite')
            : t('objets.plafond.fixe', { n: applied }),
        );
      } else {
        setMessage(t('objets.plafond.echec'));
      }
    });
  };

  return (
    <div className="rounded-[18px] border border-[var(--acc-bd)] bg-[var(--acc-bg)] p-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[520px]">
          <p className="text-[15px] font-bold text-[var(--tx)]">{t('objets.plafond.titre')}</p>
          <p className="mt-[4px] text-[13px] text-[var(--mut)]">
            {t('objets.plafond.aide', {
              valeur: max === null ? t('objets.plafond.illimite') : max,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('objets.plafond.illimite')}
            className="field w-[130px]"
          />
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="shrink-0 rounded-[10px] bg-[var(--acc)] px-4 py-[10px] text-[14px] font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50"
          >
            {pending ? t('objets.plafond.patiente') : t('objets.plafond.enregistrer')}
          </button>
        </div>
      </div>
      {message ? <p className="mt-[10px] text-[13px] text-[var(--tx)]">{message}</p> : null}
    </div>
  );
}

export function ItemsClient({
  guildId,
  initialItems,
  max: initialMax,
  roles,
  effectsUI,
  canManageLimit,
}: {
  guildId: string;
  initialItems: ShopItem[];
  max: number | null;
  roles: GuildRole[];
  /** Effets disponibles, décrits par le bot (vide = éditeur d'effets masqué). */
  effectsUI: EffectSpec[];
  canManageLimit: boolean;
}) {
  const { t } = useT();
  const [items, setItems] = useState<ShopItem[]>(initialItems);
  const [max, setMax] = useState<number | null>(initialMax);
  // null = éditeur fermé ; 'new' = création ; ShopItem = édition.
  const [editing, setEditing] = useState<ShopItem | 'new' | null>(null);
  const [page, setPage] = useState(0);
  const editorRef = useRef<HTMLDivElement | null>(null);

  // L'éditeur s'ouvre en haut de la liste : on l'amène sous les yeux, sinon un
  // clic sur un objet en bas de page semble n'avoir aucun effet.
  const editingKey = editing === null ? null : editing === 'new' ? 'new' : editing.id;
  useEffect(() => {
    if (editingKey === null) return;
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingKey]);

  const sortItems = (list: ShopItem[]) =>
    [...list].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));

  const onSaved = (saved: ShopItem) => {
    setItems((prev) => {
      const exists = prev.some((i) => i.id === saved.id);
      return sortItems(
        exists ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved],
      );
    });
    setEditing(null);
  };

  const onDeleted = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setEditing(null);
  };

  const atMax = max !== null && items.length >= max;
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = items.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-6">
      {canManageLimit ? <LimitControl max={max} onChange={setMax} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-[var(--mut)]">
          {max === null
            ? t('objets.compte', { n: items.length })
            : t('objets.compteSurMax', { n: items.length, max })}
        </p>
        {editing === null ? (
          <button
            type="button"
            onClick={() => setEditing('new')}
            disabled={atMax}
            title={atMax ? t('objets.limiteAtteinte', { max: max ?? 0 }) : undefined}
            className="rounded-[10px] bg-[var(--acc)] px-4 py-[10px] text-[14px] font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50"
          >
            {t('objets.nouveau')}
          </button>
        ) : null}
      </div>

      {editing !== null ? (
        <div ref={editorRef} className="scroll-mt-[88px]">
          <Editor
            key={editing === 'new' ? 'new' : editing.id}
            guildId={guildId}
            item={editing === 'new' ? null : editing}
            roles={roles}
            items={items}
            effectsUI={effectsUI}
            onSaved={onSaved}
            onDeleted={onDeleted}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="card p-6 text-center text-[14px] text-[var(--mut)]">
          {t('objets.aucun')}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((item) => {
              const rarity = rarityKey(item.rarity);
              const hasEffects = item.usable && item.effects !== '[]' && item.effects !== '';
              const tags = [
                item.buyable ? '🛒' : '',
                item.tradable ? '🔁' : '',
                item.droppable ? '🎲' : '',
                item.usable ? '✨' : '',
                hasEffects ? '⚙️' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setEditing(item)}
                  className="flex items-start gap-3 rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-4 text-left transition-colors hover:border-[var(--acc-bd)]"
                >
                  <span className="text-[22px] leading-none">{item.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-[var(--tx)]">
                      {item.name}
                    </p>
                    <p className="mt-[3px] text-[12px] text-[var(--mut)]">
                      {RARITY_META[rarity].emoji} {t(`objets.rarete.${rarity}`)} ·{' '}
                      {item.buyable && item.price > 0
                        ? `${String(item.price)} 🪙`
                        : t('objets.horsVente')}
                      {tags ? ` · ${tags}` : ''}
                    </p>
                    {item.description ? (
                      <p className="mt-[6px] line-clamp-2 text-[12px] text-[var(--muted2)]">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          {pageCount > 1 ? (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage === 0}
                className="rounded-[10px] border border-[var(--bd)] px-3 py-[7px] text-[13px] text-[var(--tx)] transition-colors hover:border-[var(--acc-bd)] disabled:opacity-40"
              >
                {t('objets.precedent')}
              </button>
              <span className="text-[13px] text-[var(--mut)]">
                {t('objets.pagination', { page: currentPage + 1, total: pageCount })}
              </span>
              <button
                type="button"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= pageCount - 1}
                className="rounded-[10px] border border-[var(--bd)] px-3 py-[7px] text-[13px] text-[var(--tx)] transition-colors hover:border-[var(--acc-bd)] disabled:opacity-40"
              >
                {t('objets.suivant')}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
