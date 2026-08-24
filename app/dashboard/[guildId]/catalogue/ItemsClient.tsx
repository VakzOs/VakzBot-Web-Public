'use client';

import { useState, useTransition } from 'react';
import type { GuildRole, ItemEffect, Rarity, ShopItem, ShopItemInput } from '@/lib/botApi';
import {
  createItemAction,
  deleteItemAction,
  setItemLimitAction,
  updateItemAction,
} from '../actions';
import { EmojiPicker } from './EmojiPicker';

const RARITY_META: Record<Rarity, { label: string; emoji: string }> = {
  common: { label: 'Commun', emoji: '⚪' },
  rare: { label: 'Rare', emoji: '🔵' },
  epic: { label: 'Épique', emoji: '🟣' },
  legendary: { label: 'Légendaire', emoji: '🟠' },
};
const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

const NAME_MAX = 60;
const DESC_MAX = 300;
const PRICE_MAX = 100_000_000;
const PAGE_SIZE = 25;

// --- Effets -----------------------------------------------------------------

type EffectType = ItemEffect['type'];

const EFFECT_META: { type: EffectType; label: string; help: string }[] = [
  {
    type: 'routeDamage',
    label: '🎯 Dégâts sur la Route',
    help: 'Inflige des dégâts à un membre ciblé sur son voyage.',
  },
  {
    type: 'role',
    label: '🏷️ Donner un rôle',
    help: 'Accorde un rôle Discord à celui qui l’utilise.',
  },
  {
    type: 'routeSelf',
    label: '🧭 Soin / énergie / distance',
    help: 'Bonus appliqué à SON propre voyage.',
  },
  {
    type: 'coins',
    label: '🪙 Donner des pièces',
    help: 'Crédite (ou retire) des pièces d’économie.',
  },
  { type: 'grantItem', label: '🎁 Donner un objet', help: 'Ajoute un autre objet à l’inventaire.' },
  {
    type: 'privateChannel',
    label: '🔒 Salon privé',
    help: 'Crée un salon visible par lui seul (et les admins).',
  },
  { type: 'message', label: '💬 Message', help: 'Affiche un message personnalisé.' },
];

function defaultEffect(type: EffectType): ItemEffect {
  switch (type) {
    case 'role':
      return { type: 'role', roleId: '' };
    case 'coins':
      return { type: 'coins', amount: 100 };
    case 'routeSelf':
      return { type: 'routeSelf', health: 0, energy: 0, distance: 0 };
    case 'routeDamage':
      return { type: 'routeDamage', health: 20 };
    case 'grantItem':
      return { type: 'grantItem', itemId: '', quantity: 1 };
    case 'privateChannel':
      return { type: 'privateChannel', name: 'salon-{user}' };
    case 'message':
      return { type: 'message', text: '' };
  }
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

function rarityMeta(rarity: string): { label: string; emoji: string } {
  return RARITY_META[(rarity in RARITY_META ? rarity : 'common') as Rarity];
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

function numberField(value: number, onChange: (n: number) => void, min?: number) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      onChange={(e) => {
        const n = e.target.value === '' ? 0 : Math.trunc(Number(e.target.value));
        onChange(Number.isFinite(n) ? (min !== undefined ? Math.max(min, n) : n) : 0);
      }}
      className="field"
    />
  );
}

/** Champs spécifiques à un effet selon son type. */
function EffectFields({
  effect,
  onChange,
  roles,
  items,
}: {
  effect: ItemEffect;
  onChange: (e: ItemEffect) => void;
  roles: GuildRole[];
  items: ShopItem[];
}) {
  switch (effect.type) {
    case 'role':
      return (
        <select
          value={effect.roleId}
          onChange={(e) => onChange({ type: 'role', roleId: e.target.value })}
          className="field"
        >
          <option value="">— Choisir un rôle —</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      );
    case 'coins':
      return (
        <label className="block text-[12px] text-[var(--mut)]">
          Pièces (négatif = retrait)
          {numberField(effect.amount, (amount) => onChange({ type: 'coins', amount }))}
        </label>
      );
    case 'routeSelf':
      return (
        <div className="grid grid-cols-3 gap-2">
          <label className="block text-[12px] text-[var(--mut)]">
            ❤️ Vie
            {numberField(effect.health, (health) => onChange({ ...effect, health }))}
          </label>
          <label className="block text-[12px] text-[var(--mut)]">
            ⚡ Énergie
            {numberField(effect.energy, (energy) => onChange({ ...effect, energy }))}
          </label>
          <label className="block text-[12px] text-[var(--mut)]">
            📏 Distance
            {numberField(effect.distance, (distance) => onChange({ ...effect, distance }))}
          </label>
        </div>
      );
    case 'routeDamage':
      return (
        <label className="block text-[12px] text-[var(--mut)]">
          Dégâts infligés à la cible
          {numberField(effect.health, (health) => onChange({ type: 'routeDamage', health }), 1)}
        </label>
      );
    case 'grantItem':
      return (
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <select
            value={effect.itemId}
            onChange={(e) => onChange({ ...effect, itemId: e.target.value })}
            className="field"
          >
            <option value="">— Objet à donner —</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.emoji} {it.name}
              </option>
            ))}
          </select>
          <label className="block text-[12px] text-[var(--mut)]">
            Qté
            {numberField(effect.quantity, (quantity) => onChange({ ...effect, quantity }), 1)}
          </label>
        </div>
      );
    case 'privateChannel':
      return (
        <label className="block text-[12px] text-[var(--mut)]">
          Nom du salon ({'{user}'} = pseudo)
          <input
            value={effect.name}
            onChange={(e) =>
              onChange({ type: 'privateChannel', name: e.target.value.slice(0, 90) })
            }
            placeholder="salon-{user}"
            className="field"
          />
        </label>
      );
    case 'message':
      return (
        <textarea
          value={effect.text}
          onChange={(e) => onChange({ type: 'message', text: e.target.value.slice(0, 500) })}
          placeholder="Message affiché à l’utilisation…"
          rows={2}
          className="field resize-y"
        />
      );
  }
}

/** Éditeur de la liste d'effets d'un objet. */
function EffectsEditor({
  value,
  onChange,
  roles,
  items,
}: {
  value: ItemEffect[];
  onChange: (v: ItemEffect[]) => void;
  roles: GuildRole[];
  items: ShopItem[];
}) {
  const update = (i: number, e: ItemEffect) => onChange(value.map((v, idx) => (idx === i ? e : v)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, defaultEffect('routeDamage')]);

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="text-[13px] text-[var(--muted2)]">
          Aucun effet. Ajoute-en un pour définir ce que fait l’objet à l’utilisation.
        </p>
      ) : null}
      {value.map((effect, i) => {
        const meta = EFFECT_META.find((m) => m.type === effect.type);
        return (
          <div key={i} className="rounded-[12px] border border-[var(--bd)] bg-[var(--surf)] p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <select
                  value={effect.type}
                  onChange={(e) => update(i, defaultEffect(e.target.value as EffectType))}
                  className="field"
                >
                  {EFFECT_META.map((m) => (
                    <option key={m.type} value={m.type}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {meta ? <p className="text-[12px] text-[var(--muted2)]">{meta.help}</p> : null}
                <EffectFields
                  effect={effect}
                  onChange={(e) => update(i, e)}
                  roles={roles}
                  items={items}
                />
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 rounded-[8px] border border-[var(--bd)] px-2 py-1 text-[12px] text-[var(--mut)] transition-colors hover:border-[rgba(248,113,113,.5)] hover:text-[#fca5a5]"
              >
                Retirer
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
        + Ajouter un effet
      </button>
    </div>
  );
}

function Editor({
  guildId,
  item,
  roles,
  items,
  onSaved,
  onDeleted,
  onCancel,
}: {
  guildId: string;
  item: ShopItem | null;
  roles: GuildRole[];
  items: ShopItem[];
  onSaved: (item: ShopItem) => void;
  onDeleted: (id: string) => void;
  onCancel: () => void;
}) {
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
      setMessage('❌ Le nom est obligatoire.');
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
        setMessage('❌ Échec de l’enregistrement. Réessaie.');
      }
    });
  };

  const remove = () => {
    if (!item) return;
    startTransition(async () => {
      const res = await deleteItemAction(guildId, item.id);
      if (res.ok) onDeleted(item.id);
      else setMessage('❌ Échec de la suppression.');
    });
  };

  // Objets sélectionnables pour l'effet « donner un objet » (pas soi-même).
  const otherItems = items.filter((i) => i.id !== item?.id);

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[18px] font-semibold text-[var(--tx)]">
          {item ? 'Modifier l’objet' : 'Nouvel objet'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-[13px] text-[var(--mut)] transition-colors hover:text-[var(--tx)]"
        >
          Fermer
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <div>
          <label className="mb-[6px] block text-[14px] font-medium text-[var(--tx)]">Nom</label>
          <input
            value={draft.name}
            onChange={(e) => set('name', e.target.value.slice(0, NAME_MAX))}
            placeholder="Épée en bois"
            className="field"
          />
        </div>
        <div>
          <label className="mb-[6px] block text-[14px] font-medium text-[var(--tx)]">Emoji</label>
          <EmojiPicker value={draft.emoji} onChange={(v) => set('emoji', v)} placeholder="📦" />
        </div>
      </div>

      <div>
        <label className="mb-[6px] block text-[14px] font-medium text-[var(--tx)]">
          Description
        </label>
        <textarea
          value={draft.description}
          onChange={(e) => set('description', e.target.value.slice(0, DESC_MAX))}
          placeholder="Un objet bien pratique…"
          rows={2}
          className="field resize-y"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-[6px] block text-[14px] font-medium text-[var(--tx)]">Rareté</label>
          <select
            value={draft.rarity}
            onChange={(e) => set('rarity', e.target.value)}
            className="field"
          >
            {RARITY_ORDER.map((r) => (
              <option key={r} value={r}>
                {RARITY_META[r].emoji} {RARITY_META[r].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-[6px] block text-[14px] font-medium text-[var(--tx)]">
            Prix (🪙)
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
          label="Achetable"
          help="Disponible à l’achat dans la boutique (au prix ci-dessus)."
          value={draft.buyable}
          onChange={(v) => set('buyable', v)}
        />
        <FlagRow
          label="Échangeable"
          help="Les membres peuvent se le donner entre eux."
          value={draft.tradable}
          onChange={(v) => set('tradable', v)}
        />
        <FlagRow
          label="Drop possible"
          help="Peut tomber dans les mini-jeux / la Route de l’Infini."
          value={draft.droppable}
          onChange={(v) => set('droppable', v)}
        />
        <FlagRow
          label="Utilisable"
          help="Déclenche ses effets via /utiliser."
          value={draft.usable}
          onChange={(v) => set('usable', v)}
        />
      </div>

      {draft.usable ? (
        <div className="space-y-4 rounded-[14px] border border-[var(--acc-bd)] bg-[var(--acc-bg)] p-4">
          <div>
            <p className="text-[14px] font-semibold text-[var(--tx)]">Effets à l’utilisation</p>
            <p className="mt-[2px] text-[12px] text-[var(--mut)]">
              Ce que fait l’objet quand un membre fait <code className="code">/utiliser</code>.
            </p>
          </div>
          <EffectsEditor
            value={draft.effects}
            onChange={(v) => set('effects', v)}
            roles={roles}
            items={otherItems}
          />

          <div className="border-t border-[var(--bd)] pt-3">
            <p className="mb-[8px] text-[14px] font-semibold text-[var(--tx)]">À l’usage</p>
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
                🗑️ Consommé (supprimé)
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
                🔁 Réutilisable (cooldown)
              </button>
            </div>
            {!draft.consumable ? (
              <label className="mt-3 block text-[12px] text-[var(--mut)]">
                Cooldown entre deux usages (secondes) — ex. 3600 = 1h, 0 = aucun
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
          {pending ? 'Enregistrement…' : item ? 'Enregistrer' : 'Créer l’objet'}
        </button>
        {item ? (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="rounded-[10px] border border-[rgba(248,113,113,.4)] px-5 py-[11px] text-[14px] font-semibold text-[#fca5a5] transition-colors hover:bg-[rgba(248,113,113,.08)] disabled:opacity-50"
          >
            Supprimer
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
  const [draft, setDraft] = useState(max === null ? '' : String(max));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const save = () => {
    const trimmed = draft.trim();
    const n = trimmed === '' ? 0 : Math.max(0, Math.trunc(Number(trimmed)));
    if (!Number.isFinite(n)) {
      setMessage('❌ Valeur invalide.');
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
          applied === null ? '✅ Plafond : illimité.' : `✅ Plafond fixé à ${applied} objets.`,
        );
      } else {
        setMessage('❌ Échec de l’enregistrement.');
      }
    });
  };

  return (
    <div className="rounded-[18px] border border-[var(--acc-bd)] bg-[var(--acc-bg)] p-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[520px]">
          <p className="text-[15px] font-bold text-[var(--tx)]">Plafond d’objets par serveur</p>
          <p className="mt-[4px] text-[13px] text-[var(--mut)]">
            Réglage global (propriétaire du bot). <strong className="text-[var(--tx)]">0</strong> ou
            vide = illimité. Actuel :{' '}
            <strong className="text-[var(--tx)]">{max === null ? 'illimité' : max}</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="illimité"
            className="field w-[130px]"
          />
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="shrink-0 rounded-[10px] bg-[var(--acc)] px-4 py-[10px] text-[14px] font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50"
          >
            {pending ? '…' : 'Enregistrer'}
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
  canManageLimit,
}: {
  guildId: string;
  initialItems: ShopItem[];
  max: number | null;
  roles: GuildRole[];
  canManageLimit: boolean;
}) {
  const [items, setItems] = useState<ShopItem[]>(initialItems);
  const [max, setMax] = useState<number | null>(initialMax);
  // null = éditeur fermé ; 'new' = création ; ShopItem = édition.
  const [editing, setEditing] = useState<ShopItem | 'new' | null>(null);
  const [page, setPage] = useState(0);

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
          <span className="font-semibold text-[var(--tx)]">{items.length}</span>
          {max !== null ? ` / ${max}` : ''} objets
        </p>
        {editing === null ? (
          <button
            type="button"
            onClick={() => setEditing('new')}
            disabled={atMax}
            title={atMax ? `Limite de ${max} objets atteinte` : undefined}
            className="rounded-[10px] bg-[var(--acc)] px-4 py-[10px] text-[14px] font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50"
          >
            + Nouvel objet
          </button>
        ) : null}
      </div>

      {editing !== null ? (
        <Editor
          key={editing === 'new' ? 'new' : editing.id}
          guildId={guildId}
          item={editing === 'new' ? null : editing}
          roles={roles}
          items={items}
          onSaved={onSaved}
          onDeleted={onDeleted}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {items.length === 0 ? (
        <div className="card p-6 text-center text-[14px] text-[var(--mut)]">
          Aucun objet pour l’instant. Clique sur « Nouvel objet » pour en créer un.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((item) => {
              const rm = rarityMeta(item.rarity);
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
                      {rm.emoji} {rm.label} ·{' '}
                      {item.buyable && item.price > 0 ? `${item.price} 🪙` : 'Hors vente'}
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
                ← Précédent
              </button>
              <span className="text-[13px] text-[var(--mut)]">
                Page {currentPage + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= pageCount - 1}
                className="rounded-[10px] border border-[var(--bd)] px-3 py-[7px] text-[13px] text-[var(--tx)] transition-colors hover:border-[var(--acc-bd)] disabled:opacity-40"
              >
                Suivant →
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
