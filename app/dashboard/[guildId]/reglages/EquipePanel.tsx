'use client';

import { useMemo, useState, useTransition } from 'react';
import type { AccessModule, Grade, GuildGrades } from '@/lib/botApi';
import { useT } from '@/components/I18n';
import { setGradesAction } from '../actions';

/**
 * Le panneau « Équipe » : les grades du serveur.
 *
 * Un grade, c'est trois choix indépendants, et c'est ce qui fait sa souplesse :
 * un NOM que le serveur choisit, ce que le grade OUVRE (des modules entiers ou
 * seulement certains de leurs blocs de réglages), et ce qui le CONFÈRE — des
 * rôles Discord, des membres nommés, ou les deux. Créer un grade ne crée aucun
 * rôle : un serveur qui ne veut pas d'un rôle « Staff » visible dans sa liste
 * de membres peut nommer trois personnes et s'arrêter là.
 *
 * Ce panneau n'est montré qu'aux administrateurs du serveur, et le bot refuse
 * les autres : distribuer le pouvoir ne se délègue pas, sinon un gradé
 * s'élargirait lui-même.
 */

/** Un grade en cours d'édition : l'identifiant manque tant qu'il est neuf. */
type Draft = Omit<Grade, 'id'> & { id?: string; key: string };

/** Les catégories du bot, dans l'ordre d'affichage (voir `ModulesClient`). */
const CATEGORY_ORDER = ['security', 'community', 'engagement', 'operations', 'fun'];

function toDraft(grade: Grade): Draft {
  return { ...grade, key: grade.id };
}

function emptyDraft(name: string): Draft {
  return {
    key: `neuf-${Math.random().toString(36).slice(2)}`,
    name,
    roleIds: [],
    memberIds: [],
    permissions: [],
    position: 0,
  };
}

/** Coche / décoche, sans dupliquer ni laisser de trou. */
function toggle(values: string[], value: string, on: boolean): string[] {
  if (on) return values.includes(value) ? values : [...values, value];
  return values.filter((v) => v !== value);
}

function Checkbox({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-[9px] text-[13px] ${
        disabled ? 'opacity-50' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        className="mt-[3px] h-[15px] w-[15px] shrink-0 accent-[var(--acc)]"
      />
      <span>
        <span className="text-[var(--tx)]">{label}</span>
        {hint ? <span className="ml-[6px] text-[var(--mut)]">{hint}</span> : null}
      </span>
    </label>
  );
}

/** Ce qu'un grade ouvre d'un module : tout, ou certains de ses blocs. */
function ModuleRow({
  mod,
  permissions,
  onChange,
}: {
  mod: AccessModule;
  permissions: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useT();
  const whole = permissions.includes(mod.permission);
  // Ce que ce grade tient déjà de ce module, hors module entier : blocs,
  // verbes et boutons confondus — c'est ce que le repli doit annoncer.
  const detail = [
    ...mod.parts.flatMap((part) => [part.permission, ...part.verbs.map((v) => v.permission)]),
    ...mod.actions.map((action) => action.permission),
  ];
  const chosen = detail.filter((permission) => permissions.includes(permission));
  const detailed = mod.parts.length > 0 || mod.actions.length > 0;
  const [open, setOpen] = useState(false);

  /**
   * Toutes les cases FINES de ce module : les verbes de chaque bloc plutôt que
   * le bloc lui-même, parce que c'est l'état depuis lequel on peut ensuite en
   * retirer une. Cocher le bloc entier figerait ses verbes.
   */
  const everything = [
    ...mod.parts.flatMap((part) =>
      part.verbs.length > 0 ? part.verbs.map((verb) => verb.permission) : [part.permission],
    ),
    ...mod.actions.map((action) => action.permission),
  ];
  const allTicked =
    everything.length > 0 && everything.every((permission) => permissions.includes(permission));

  /** Sans ce module : la base sur laquelle on recompose. */
  const without = (): string[] =>
    permissions.filter((p) => p !== mod.permission && !detail.includes(p));

  return (
    <div className="rounded-[12px] border border-[var(--bd)] p-[11px]">
      <div className="flex items-center gap-[9px]">
        <Checkbox
          checked={whole}
          onChange={(on) => {
            // Cocher le module entier remplace tout son détail : garder les
            // deux laisserait des cases cochées qui ne veulent plus rien dire.
            let next = toggle(permissions, mod.permission, on);
            if (on) next = next.filter((p) => !detail.includes(p));
            onChange(next);
          }}
          label={`${mod.emoji} ${mod.label}`}
        />
        {detailed ? (
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v);
            }}
            className="ml-auto shrink-0 text-[12px] text-[var(--mut)] transition-colors hover:text-[var(--tx)]"
          >
            {whole
              ? t('reglages.equipe.detailTout')
              : chosen.length > 0
                ? t('reglages.equipe.detailChoisi', { n: chosen.length })
                : t('reglages.equipe.detailAucun')}
            {open ? ' ▴' : ' ▾'}
          </button>
        ) : null}
      </div>

      {open && detailed ? (
        <div className="mt-[9px] grid gap-[10px] border-t border-[var(--bd)] pl-[24px] pt-[9px]">
          {/* Tout cocher d'un geste — et, quand le module est pris en entier,
              le DÉTAILLER : c'est le seul moyen d'en retirer ensuite une pièce,
              puisque « module entier » fige ses cases. */}
          <button
            type="button"
            onClick={() => {
              if (whole || !allTicked) {
                onChange([...without(), ...everything]);
                return;
              }
              onChange(without());
            }}
            className="justify-self-start text-[12px] font-semibold text-[var(--acc2)] transition-colors hover:brightness-110"
          >
            {whole
              ? t('reglages.equipe.toutDetailler')
              : allTicked
                ? t('reglages.equipe.toutDecocher')
                : t('reglages.equipe.toutCocher')}
          </button>

          {mod.parts.map((part) => {
            const held = whole || permissions.includes(part.permission);
            return (
              <div key={part.permission}>
                <Checkbox
                  // Le module entier contient déjà tout : les blocs s'affichent
                  // cochés et figés plutôt que de disparaître, pour qu'on voie
                  // ce qu'on vient d'accorder.
                  checked={held}
                  disabled={whole}
                  onChange={(on) => {
                    // Cocher le bloc entier remplace ses verbes.
                    let next = toggle(permissions, part.permission, on);
                    if (on) {
                      next = next.filter((p) => !part.verbs.some((verb) => verb.permission === p));
                    }
                    onChange(next);
                  }}
                  // Un module à bloc unique redirait son propre nom : la
                  // ligne annonce alors ce qu'elle est vraiment, le raccourci
                  // vers tous les verbes. Un bloc sans nom propre porte le mot
                  // que la page du module met sur lui — « Général » — jamais son
                  // identifiant technique, que personne n'a à déchiffrer.
                  label={
                    mod.parts.length === 1
                      ? t('reglages.equipe.tousReglages')
                      : (part.label ?? t('dashboard.module.groupeParDefaut'))
                  }
                />
                {/* Les verbes : la maille la plus fine sur des lignes. Un bloc
                    sans liste n'en a aucun — le cocher vaut « modifier ». */}
                {part.verbs.length > 0 ? (
                  <div className="mt-[5px] flex flex-wrap gap-x-[14px] gap-y-[4px] pl-[24px]">
                    {part.verbs.map((verb) => (
                      <Checkbox
                        key={verb.permission}
                        checked={held || permissions.includes(verb.permission)}
                        disabled={held}
                        onChange={(on) => {
                          onChange(toggle(permissions, verb.permission, on));
                        }}
                        label={t(`reglages.equipe.verbes.${verb.id}`)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}

          {/* Les boutons du module, un par un : « republier un message
              épinglé » se confie sans confier la liste des messages. */}
          {mod.actions.length > 0 ? (
            <div className="border-t border-[var(--bd)] pt-[9px]">
              <p className="mb-[5px] text-[12px] font-semibold text-[var(--mut)]">
                {t('reglages.equipe.boutons')}
              </p>
              <div className="grid gap-[5px]">
                {mod.actions.map((action) => (
                  <Checkbox
                    key={action.permission}
                    checked={whole || permissions.includes(action.permission)}
                    disabled={whole}
                    onChange={(on) => {
                      onChange(toggle(permissions, action.permission, on));
                    }}
                    // Les deux boutons réservés du bot n'ont pas de libellé :
                    // c'est le site qui les nomme.
                    label={
                      action.label ??
                      (action.id === 'activer'
                        ? t('reglages.equipe.boutonActiver')
                        : t('reglages.equipe.boutonPublier'))
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function EquipePanel({ guildId, initial }: { guildId: string; initial: GuildGrades }) {
  const { t } = useT();
  const [drafts, setDrafts] = useState<Draft[]>((initial.grades ?? []).map(toDraft));
  const [openGrade, setOpenGrade] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const roles = initial.roles ?? [];
  const memberNames = useMemo(
    () => new Map((initial.members ?? []).map((m) => [m.id, m.name])),
    [initial.members],
  );

  /** Les modules rangés par catégorie, comme sur la page du serveur. */
  const byCategory = useMemo(() => {
    const groups = new Map<string, AccessModule[]>();
    for (const mod of initial.modules) {
      const list = groups.get(mod.category) ?? [];
      list.push(mod);
      groups.set(mod.category, list);
    }
    return [...groups.entries()].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]),
    );
  }, [initial.modules]);

  const patch = (key: string, change: Partial<Draft>) => {
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...change } : d)));
  };

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await setGradesAction(
        guildId,
        drafts.map((draft, index) => ({
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          roleIds: draft.roleIds,
          memberIds: draft.memberIds,
          permissions: draft.permissions,
          position: index,
        })),
      );
      if (!res.ok || !res.grades) {
        setMessage(t('reglages.equipe.echec'));
        return;
      }
      // On réaffiche ce que le bot a RETENU, pas ce qu'on lui a soumis : il
      // écarte les rôles supprimés et les modules qu'il ne sert pas.
      setDrafts(res.grades.map(toDraft));
      setMessage(t('reglages.equipe.enregistre'));
    });
  };

  return (
    <section className="card p-[22px]">
      <p className="text-[16px] font-bold">{t('reglages.equipe.titre')}</p>
      <p className="mt-[6px] text-[14px] text-[var(--mut)]">{t('reglages.equipe.intro')}</p>
      <p className="mt-[6px] text-[13px] text-[var(--mut)]">{t('reglages.equipe.reserve')}</p>

      <div className="mt-5 flex flex-col gap-[14px]">
        {drafts.length === 0 ? (
          <p className="rounded-[14px] border border-[var(--bd)] p-4 text-[13px] text-[var(--mut)]">
            {t('reglages.equipe.aucun')}
          </p>
        ) : null}

        {drafts.map((draft) => {
          const open = openGrade === draft.key;
          return (
            <div key={draft.key} className="rounded-[16px] border border-[var(--bd)] p-[15px]">
              <div className="flex flex-wrap items-center gap-[10px]">
                <input
                  value={draft.name}
                  onChange={(e) => {
                    patch(draft.key, { name: e.target.value });
                  }}
                  placeholder={t('reglages.equipe.nomPlaceholder')}
                  maxLength={60}
                  className="min-w-[160px] flex-1 rounded-[10px] border border-[var(--bd)] bg-[var(--bg)] px-[11px] py-[8px] text-[14px] font-semibold text-[var(--tx)]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setOpenGrade(open ? null : draft.key);
                  }}
                  className="rounded-[10px] border border-[var(--bd)] px-[12px] py-[8px] text-[13px] transition-colors hover:border-[var(--acc-bd)]"
                >
                  {open ? t('reglages.equipe.replier') : t('reglages.equipe.deplier')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrafts((list) => list.filter((d) => d.key !== draft.key));
                  }}
                  className="rounded-[10px] border border-red-500/40 px-[12px] py-[8px] text-[13px] text-red-400 transition-colors hover:bg-red-500/10"
                >
                  {t('reglages.equipe.supprimer')}
                </button>
              </div>

              <p className="mt-[8px] text-[12px] text-[var(--mut)]">
                {t('reglages.equipe.resume', {
                  droits: draft.permissions.length,
                  roles: draft.roleIds.length,
                  membres: draft.memberIds.length,
                })}
              </p>

              {open ? (
                <div className="mt-4 grid gap-5">
                  {/* Ce qui confère le grade. Les deux listes sont facultatives
                      et se cumulent : un grade sans l'une ni l'autre existe et
                      ne confère rien — c'est un brouillon, pas une faille. */}
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--tx)]">
                      {t('reglages.equipe.confere')}
                    </p>
                    <p className="mt-[3px] text-[12px] text-[var(--mut)]">
                      {t('reglages.equipe.confereAide')}
                    </p>

                    <p className="mt-[10px] text-[12px] font-semibold text-[var(--mut)]">
                      {t('reglages.equipe.roles')}
                    </p>
                    {roles.length === 0 ? (
                      <p className="mt-[6px] text-[12px] text-[var(--mut)]">
                        {t('reglages.equipe.rolesVides')}
                      </p>
                    ) : (
                      <div className="mt-[6px] grid max-h-[220px] gap-[6px] overflow-y-auto rounded-[12px] border border-[var(--bd)] p-[11px] sm:grid-cols-2">
                        {roles.map((role) => (
                          <Checkbox
                            key={role.id}
                            checked={draft.roleIds.includes(role.id)}
                            onChange={(on) => {
                              patch(draft.key, {
                                roleIds: toggle(draft.roleIds, role.id, on),
                              });
                            }}
                            label={role.name}
                          />
                        ))}
                      </div>
                    )}

                    <p className="mt-[12px] text-[12px] font-semibold text-[var(--mut)]">
                      {t('reglages.equipe.membres')}
                    </p>
                    <MembersField
                      ids={draft.memberIds}
                      names={memberNames}
                      onChange={(memberIds) => {
                        patch(draft.key, { memberIds });
                      }}
                    />
                  </div>

                  {/* Ce que le grade ouvre. */}
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--tx)]">
                      {t('reglages.equipe.ouvre')}
                    </p>
                    <p className="mt-[3px] text-[12px] text-[var(--mut)]">
                      {t('reglages.equipe.ouvreAide')}
                    </p>

                    <div className="mt-[10px] grid gap-[6px] rounded-[12px] border border-[var(--bd)] p-[11px]">
                      {initial.scopes.map((scope) => (
                        <Checkbox
                          key={scope}
                          checked={draft.permissions.includes(scope)}
                          onChange={(on) => {
                            patch(draft.key, {
                              permissions: toggle(draft.permissions, scope, on),
                            });
                          }}
                          label={t(`reglages.equipe.portees.${scope}`)}
                        />
                      ))}
                    </div>

                    {byCategory.map(([category, mods]) => (
                      <div key={category} className="mt-[14px]">
                        <p className="text-[12px] font-semibold text-[var(--mut)]">
                          {t(`dashboard.modules.categories.${category}`)}
                        </p>
                        <div className="mt-[6px] grid gap-[8px]">
                          {mods.map((mod) => (
                            <ModuleRow
                              key={mod.name}
                              mod={mod}
                              permissions={draft.permissions}
                              onChange={(permissions) => {
                                patch(draft.key, { permissions });
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-[10px]">
        <button
          type="button"
          disabled={drafts.length >= initial.maxGrades}
          onClick={() => {
            const draft = emptyDraft(t('reglages.equipe.nouveauNom'));
            setDrafts((list) => [...list, draft]);
            setOpenGrade(draft.key);
          }}
          className="rounded-[10px] border border-[var(--bd)] px-[14px] py-[9px] text-[13px] font-semibold transition-colors hover:border-[var(--acc-bd)] disabled:opacity-50"
        >
          {t('reglages.equipe.ajouter')}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="btn-accent px-[16px] py-[9px] text-[13px] disabled:opacity-50"
        >
          {pending ? t('reglages.equipe.enregistrement') : t('reglages.equipe.enregistrer')}
        </button>
        {message ? <span className="text-[13px] text-[var(--mut)]">{message}</span> : null}
      </div>
    </section>
  );
}

/**
 * Les membres nommés dans un grade.
 *
 * On saisit un identifiant Discord, parce que c'est ce qu'un administrateur
 * peut copier depuis son client sans que le site ait à télécharger la liste des
 * membres du serveur — laquelle peut en compter cent mille. Le bot renvoie le
 * pseudo de ceux qu'il voit : sans lui, un grade ouvert six mois plus tard
 * n'afficherait qu'une suite de chiffres.
 */
function MembersField({
  ids,
  names,
  onChange,
}: {
  ids: string[];
  names: Map<string, string | null>;
  onChange: (next: string[]) => void;
}) {
  const { t } = useT();
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const add = () => {
    const id = value.trim();
    if (!/^\d{5,25}$/.test(id)) {
      setError(true);
      return;
    }
    setError(false);
    setValue('');
    if (!ids.includes(id)) onChange([...ids, id]);
  };

  return (
    <div className="mt-[6px]">
      <div className="flex flex-wrap gap-[6px]">
        {ids.map((id) => (
          <span
            key={id}
            className="flex items-center gap-[6px] rounded-[9px] border border-[var(--bd)] px-[9px] py-[5px] text-[12px]"
          >
            {names.get(id) ?? id}
            <button
              type="button"
              onClick={() => {
                onChange(ids.filter((v) => v !== id));
              }}
              className="text-[var(--mut)] transition-colors hover:text-red-400"
              aria-label={t('reglages.equipe.retirerMembre')}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-[6px] flex gap-[6px]">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          inputMode="numeric"
          placeholder={t('reglages.equipe.membrePlaceholder')}
          className="min-w-0 flex-1 rounded-[10px] border border-[var(--bd)] bg-[var(--bg)] px-[11px] py-[7px] text-[13px] text-[var(--tx)]"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-[10px] border border-[var(--bd)] px-[12px] py-[7px] text-[13px] transition-colors hover:border-[var(--acc-bd)]"
        >
          {t('reglages.equipe.ajouterMembre')}
        </button>
      </div>
      {error ? (
        <p className="mt-[5px] text-[12px] text-red-400">{t('reglages.equipe.membreInvalide')}</p>
      ) : null}
    </div>
  );
}
