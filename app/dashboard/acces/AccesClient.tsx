'use client';

import { type ReactNode, useState, useTransition } from 'react';
import { useT } from '@/components/I18n';
import { formatDateTime, useTimeZone } from '@/lib/dates';
import type { BotGuild, InvitationsState, InviteCode, InviteRequest } from '@/lib/invitations';
import {
  createCodeAction,
  deleteCodeAction,
  dismissRequestAction,
  replyRequestAction,
  revokeCodeAction,
  setGuildAction,
  setGuildBlockAction,
  setRequireAction,
  setSiteUrlAction,
} from './actions';

/**
 * Le panneau du propriétaire du bot : la porte, les codes, les serveurs entrés.
 *
 * Il vit dans le dashboard, à `/dashboard/acces`, et non sous les réglages d'un
 * serveur : ce qu'on règle ici ne concerne aucun serveur en particulier, et le
 * ranger sous `/dashboard/<serveur>/reglages` l'aurait fait dépendre d'un
 * serveur qu'on peut quitter — en plus d'obliger à modifier des fichiers
 * partagés, que cette fonctionnalité, propre à cette instance, doit justement
 * pouvoir quitter sans laisser de trace.
 *
 * Chaque action renvoie l'état COMPLET tel que le bot le connaît après coup :
 * c'est lui qu'on réaffiche, jamais ce qu'on croyait avoir envoyé. Un code que
 * le bot a refusé de révoquer doit se remontrer intact.
 *
 * Quatre onglets plutôt qu'un déroulé : empilés, les demandes, le générateur,
 * les codes et les serveurs faisaient une page où l'on cherchait son réglage en
 * faisant défiler. Même découpage que les réglages d'un serveur, et pour la
 * même raison — ces panneaux n'ont rien à voir entre eux.
 *
 * Une exception, et elle est délibérée : le code fraîchement tiré s'affiche
 * AU-DESSUS des onglets. Répondre à une demande en tire un, et il paraîtrait
 * sinon dans un onglet qu'on ne regarde pas — le code serait à chercher, alors
 * que c'est la seule chose qu'on soit venu chercher.
 */

/** Un bouton secondaire, discret, tel qu'on en pose plusieurs par ligne. */
function SmallButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        danger
          ? 'rounded-[9px] border border-[rgba(248,113,113,.4)] px-[11px] py-[6px] text-[13px] font-semibold text-[#fca5a5] transition-colors hover:bg-[rgba(248,113,113,.1)] disabled:opacity-50'
          : 'rounded-[9px] border border-[var(--bd)] px-[11px] py-[6px] text-[13px] font-semibold text-[var(--mut)] transition-colors hover:bg-[var(--surf-hover)] hover:text-[var(--tx)] disabled:opacity-50'
      }
    >
      {children}
    </button>
  );
}

export function AccesClient({ initial }: { initial: InvitationsState | null }) {
  const { t } = useT();
  const timeZone = useTimeZone();
  const format = t('langue.format');

  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [label, setLabel] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [days, setDays] = useState('0');
  const [siteUrl, setSiteUrl] = useState(initial?.siteUrl ?? '');
  const [copied, setCopied] = useState<string | null>(null);
  const [avances, setAvances] = useState(false);
  /** Le dernier code tiré, montré en grand tant qu'on n'en tire pas un autre. */
  const [nouveau, setNouveau] = useState<{ code: string; label: string } | null>(null);
  /** Le mot en cours de rédaction, par demande. */
  const [reponses, setReponses] = useState<Record<string, string>>({});
  /**
   * Le serveur dont on est en train d'écrire le motif de blocage, et ce qu'on
   * y écrit. Le motif se demande AVANT le blocage : après, plus personne ne se
   * souvient de ce qui l'avait décidé, et c'est ce qu'on relit le jour où l'on
   * hésite à rouvrir.
   */
  const [blocage, setBlocage] = useState<string | null>(null);
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  /**
   * Le sort du dernier message privé. Il échoue dès qu'aucun serveur n'est
   * commun — le cas de qui demande un code — et il faut le dire sans alarmer :
   * la réponse, elle, attend son auteur sur le site.
   */
  const [remis, setRemis] = useState<{ userId: string; delivered: boolean } | null>(null);
  /**
   * L'onglet ouvert à l'arrivée : les demandes quand il y en a — c'est ce qui
   * attend une réponse —, les codes sinon, qui est ce qu'on vient faire.
   */
  const [onglet, setOnglet] = useState(
    initial?.requests?.some((request) => !request.answeredAt) ? 'demandes' : 'codes',
  );

  if (!state) {
    return (
      <section className="card p-[22px]">
        <p className="text-[15px] text-[var(--mut)]">{t('invitations.proprio.indisponible')}</p>
      </section>
    );
  }

  /** Joue une action et réaffiche ce que le bot a réellement retenu. */
  const run = (action: () => Promise<InvitationsState | null>) => {
    setError(null);
    startTransition(async () => {
      const next = await action();
      if (next) setState(next);
      else setError(t('invitations.proprio.echec'));
    });
  };

  /**
   * Tire un code. Le code lui-même vient du bot : la page ne fabrique aucun
   * secret — un `Math.random()` de navigateur n'en est pas un, et de toute
   * façon c'est le bot qui décide de ce qui est valable chez lui.
   *
   * Le code neuf se reconnaît à son identifiant, absent de la liste d'avant :
   * plus sûr que de prendre le premier de la nouvelle liste, dont l'ordre est
   * une affaire de tri.
   */
  const creer = () => {
    const nom = label.trim();
    run(async () => {
      const tire = await tirer(nom, Number(maxUses) || 0, Number(days) || 0);
      if (!tire) return null;
      setLabel('');
      return tire.state;
    });
  };

  /**
   * Tire un code et retient celui qui vient d'apparaître.
   *
   * Le code neuf se reconnaît à son identifiant, absent de la liste d'avant :
   * plus sûr que de prendre le premier de la nouvelle liste, dont l'ordre est
   * une affaire de tri.
   */
  const tirer = async (
    nom: string,
    maxUsesValue: number,
    daysValue: number,
  ): Promise<{ state: InvitationsState; code: string } | null> => {
    const avant = new Set(state.codes.map((code) => code.id));
    const next = await createCodeAction({
      label: nom,
      maxUses: maxUsesValue,
      expiresInDays: daysValue,
    });
    if (!next) return null;
    const cree = next.codes.find((code) => !avant.has(code.id));
    setNouveau(cree ? { code: cree.code, label: nom } : null);
    // Le code est RENDU et pas seulement posé dans l'état : répondre en a
    // besoin tout de suite, et un `useState` ne se relit pas dans le même tour.
    return { state: next, code: cree?.code ?? '' };
  };

  /**
   * Répond à une demande : le mot écrit, et — sauf `motSeul` — un code à usage
   * unique, sans expiration, au nom de qui l'a demandée.
   *
   * La demande n'est PAS effacée : c'est elle qui portera la réponse jusqu'à
   * son auteur quand il reviendra sur le site. Le message privé est tenté par
   * le bot, et son sort s'affiche — il échoue dès qu'aucun serveur n'est
   * commun, ce qui est le cas de quiconque demande un code.
   */
  const repondre = (request: InviteRequest, motSeul: boolean) => {
    const mot = (reponses[request.userId] ?? '').trim();
    setRemis(null);
    run(async () => {
      let code = '';
      if (!motSeul) {
        const tire = await tirer(request.name ?? request.username ?? request.userId, 1, 0);
        if (!tire) return null;
        code = tire.code;
      }
      const outcome = await replyRequestAction({ userId: request.userId, message: mot, code });
      if (outcome.status !== 'ok') return null;
      setRemis({ userId: request.userId, delivered: outcome.delivered });
      setReponses((current) => ({ ...current, [request.userId]: '' }));
      return outcome.state;
    });
  };

  const copy = (code: string) => {
    void navigator.clipboard
      ?.writeText(code)
      .then(() => setCopied(code))
      .catch(() => setCopied(null));
  };

  /** « 2/5 serveur(s) », ou l'illimité quand le code n'a pas de plafond. */
  const usageLabel = (code: InviteCode): string =>
    code.maxUses > 0
      ? t('invitations.proprio.codes.usages', { uses: code.uses, max: code.maxUses })
      : t('invitations.proprio.codes.usagesIllimite', { uses: code.uses });

  /**
   * Une autorisation est-elle écrite au nom de ce serveur ?
   *
   * Le site se déploie sur Vercel en une minute, le bot au rythme de son
   * updater : entre les deux, l'API rend des serveurs sans `invited`. Un
   * `createdAt` tient alors lieu de réponse — l'ancien format ne listait que
   * des serveurs autorisés, et leur date d'autorisation ne manquait jamais.
   */
  const estAutorise = (guild: BotGuild): boolean => guild.invited ?? Boolean(guild.createdAt);

  /**
   * D'où vient ce serveur : un code, une autorisation posée à la main, ou rien
   * du tout — le cas d'un serveur entré pendant que la porte était ouverte,
   * celui-là même qu'on vient chercher ici.
   */
  const guildOrigin = (guild: BotGuild): string => {
    if (!estAutorise(guild)) return t('invitations.proprio.serveurs.porteOuverte');
    if (!guild.code) return t('invitations.proprio.serveurs.sansCode');
    const par = t('invitations.proprio.serveurs.par', { code: guild.code });
    return guild.codeLabel ? `${par} · ${guild.codeLabel}` : par;
  };

  /** La deuxième ligne : d'où vient ce serveur, par qui, et depuis quand. */
  const guildDetails = (guild: BotGuild): string => {
    const parts = [guildOrigin(guild)];
    if (guild.addedBy || guild.userId) {
      parts.push(
        t('invitations.proprio.serveurs.ajoutePar', { qui: guild.addedBy ?? guild.userId ?? '' }),
      );
    }
    if (guild.present && guild.joinedAt) {
      parts.push(
        t('invitations.proprio.serveurs.arrive', {
          date: formatDateTime(format, guild.joinedAt, timeZone),
        }),
      );
    } else if (guild.createdAt) {
      parts.push(
        t('invitations.proprio.serveurs.autorise', {
          date: formatDateTime(format, guild.createdAt, timeZone),
        }),
      );
    }
    return parts.join(' · ');
  };

  const demandes = state.requests ?? [];
  /** Ce qui attend vraiment une réponse : une demande traitée n'alerte plus. */
  const enAttente = demandes.filter((request) => !request.answeredAt).length;

  const porte = (
    <div className="space-y-5">
      {/* La porte ------------------------------------------------------- */}
      <div className="card p-[22px]">
        <h3 className="text-[16px] font-bold">{t('invitations.proprio.porte.titre')}</h3>
        <p className="mt-2 max-w-[680px] text-[14px] leading-[1.6] text-[var(--mut)]">
          {state.require
            ? t('invitations.proprio.porte.exige')
            : t('invitations.proprio.porte.libre')}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SmallButton
            onClick={() => run(() => setRequireAction(!state.require))}
            disabled={pending}
          >
            {state.require
              ? t('invitations.proprio.porte.ouvrir')
              : t('invitations.proprio.porte.exiger')}
          </SmallButton>
          <span className="text-[13px] text-[var(--muted2)]">
            {t('invitations.proprio.porte.note')}
          </span>
        </div>

      </div>

      {/* L'adresse du site ---------------------------------------------- */}
      <div className="card p-[22px]">
        <h3 className="text-[16px] font-bold">{t('invitations.proprio.site.titre')}</h3>
        <label htmlFor="site-url" className="mt-4 block text-[14px] font-semibold">
          {t('invitations.proprio.site.label')}
        </label>
        <div className="mt-2 flex flex-wrap gap-3">
          <input
            id="site-url"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://"
            className="field max-w-[360px]"
          />
          <SmallButton onClick={() => run(() => setSiteUrlAction(siteUrl))} disabled={pending}>
            {t('invitations.proprio.site.enregistrer')}
          </SmallButton>
        </div>
        <p className="mt-2 text-[13px] text-[var(--muted2)]">
          {t('invitations.proprio.site.aide')}
        </p>
      </div>
    </div>
  );

  const listeDemandes = (
    <div className="card p-[22px]">
      <h3 className="text-[16px] font-bold">{t('invitations.proprio.demandes.titre')}</h3>
      {/* Le site se déploie sur Vercel en une minute, le bot au rythme de son
          updater : pendant ce décalage, l'API peut être d'une version qui ne
          connaît pas encore les demandes. Un panneau vide vaut mieux qu'une
          page blanche. */}
      {demandes.length === 0 ? (
        <p className="mt-3 text-[14px] text-[var(--mut)]">
          {t('invitations.proprio.demandes.aucune')}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {demandes.map((request) => {
            const nom = request.name ?? request.username ?? request.userId;
            const reponse = reponses[request.userId] ?? '';
            return (
              <li key={request.userId} className="rounded-[14px] border border-[var(--bd)] p-[14px]">
                {/* Qui c'est. Un identifiant nu ne se reconnaît pas : le bot
                    redemande l'identité à Discord, et le lien de profil est le
                    seul moyen fiable de joindre quelqu'un avec qui on ne
                    partage aucun serveur. */}
                <div className="flex flex-wrap items-center gap-3">
                  {request.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={request.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full" />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--acc)] to-[var(--acc2)] text-[15px] font-bold text-white">
                      {nom.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold">{nom}</p>
                    {request.tag && request.tag !== nom ? (
                      <p className="truncate text-[13px] text-[var(--mut)]">{request.tag}</p>
                    ) : null}
                  </div>
                </div>

                <p className="mt-3 text-[13px] text-[var(--muted2)]">
                  {t('invitations.proprio.demandes.identifiant', {
                    id: request.userId,
                    date: formatDateTime(format, request.createdAt, timeZone),
                  })}
                </p>
                {request.accountCreatedAt ? (
                  <p className="text-[13px] text-[var(--muted2)]">
                    {t('invitations.proprio.demandes.compte', {
                      date: formatDateTime(format, request.accountCreatedAt, timeZone),
                    })}
                  </p>
                ) : null}

                <p className="mt-2 whitespace-pre-wrap text-[14px] leading-[1.6] text-[var(--mut)]">
                  {request.message || t('invitations.proprio.demandes.sansMessage')}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`https://discord.com/users/${request.userId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-[9px] border border-[var(--bd)] px-[11px] py-[6px] text-[13px] font-semibold text-[var(--mut)] transition-colors hover:bg-[var(--surf-hover)] hover:text-[var(--tx)]"
                  >
                    {t('invitations.proprio.demandes.profil')}
                  </a>
                  <SmallButton onClick={() => copy(request.userId)}>
                    {copied === request.userId
                      ? t('invitations.proprio.demandes.copie')
                      : t('invitations.proprio.demandes.copierId')}
                  </SmallButton>
                </div>

                {request.answeredAt ? (
                  /* Déjà répondu : ce qui compte est ce que la personne lira,
                     pas un formulaire de plus. */
                  <div className="mt-3 rounded-[12px] border border-[rgba(52,211,153,.32)] bg-[rgba(52,211,153,.06)] p-[12px]">
                    <p className="text-[13px] font-semibold text-[#34d399]">
                      {t('invitations.proprio.demandes.repondu', {
                        date: formatDateTime(format, request.answeredAt, timeZone),
                      })}
                    </p>
                    {request.reply ? (
                      <p className="mt-2 whitespace-pre-wrap text-[14px] leading-[1.6] text-[var(--mut)]">
                        {request.reply}
                      </p>
                    ) : null}
                    {request.grantedCode ? (
                      <p className="mt-2 text-[13px] text-[var(--muted2)]">
                        {t('invitations.proprio.demandes.codeAccorde')} :{' '}
                        <span className="code tracking-[0.12em]">{request.grantedCode}</span>
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <label
                      htmlFor={`reponse-${request.userId}`}
                      className="mt-4 block text-[14px] font-semibold"
                    >
                      {t('invitations.proprio.demandes.reponseLabel')}
                    </label>
                    <textarea
                      id={`reponse-${request.userId}`}
                      value={reponse}
                      onChange={(e) =>
                        setReponses({ ...reponses, [request.userId]: e.target.value })
                      }
                      placeholder={t('invitations.proprio.demandes.reponsePlaceholder')}
                      maxLength={1000}
                      rows={2}
                      className="field mt-2 w-full resize-y"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <SmallButton onClick={() => repondre(request, false)} disabled={pending}>
                        {t('invitations.proprio.demandes.generer')}
                      </SmallButton>
                      <SmallButton
                        onClick={() => repondre(request, true)}
                        disabled={pending || !reponse.trim()}
                      >
                        {t('invitations.proprio.demandes.repondre')}
                      </SmallButton>
                      <SmallButton
                        danger
                        disabled={pending}
                        onClick={() => {
                          if (!confirm(t('invitations.proprio.demandes.confirmer'))) return;
                          run(() => dismissRequestAction(request.userId));
                        }}
                      >
                        {t('invitations.proprio.demandes.ecarter')}
                      </SmallButton>
                    </div>
                  </>
                )}

                {remis?.userId === request.userId ? (
                  <p
                    className="mt-3 text-[13px] leading-[1.5]"
                    style={{ color: remis.delivered ? '#34d399' : 'var(--muted2)' }}
                  >
                    {remis.delivered
                      ? t('invitations.proprio.demandes.mpParti')
                      : t('invitations.proprio.demandes.mpEchoue')}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const codes = (
    <div className="space-y-5">
      {/* Générer un code ------------------------------------------------- */}
      <div className="card p-[22px]">
        <h3 className="text-[16px] font-bold">{t('invitations.proprio.creer.titre')}</h3>
        <p className="mt-2 max-w-[680px] text-[14px] leading-[1.6] text-[var(--mut)]">
          {t('invitations.proprio.creer.securite')}
        </p>

        <label htmlFor="code-memo" className="mt-5 block text-[14px] font-semibold">
          {t('invitations.proprio.creer.label')}
        </label>
        <div className="mt-2 flex flex-wrap gap-3">
          <input
            id="code-memo"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && label.trim() && !pending) creer();
            }}
            maxLength={80}
            className="field max-w-[280px]"
          />
          <button
            type="button"
            disabled={pending || !label.trim()}
            onClick={creer}
            className="btn-accent px-[18px] py-[10px] text-[14px] disabled:opacity-50"
          >
            {t('invitations.proprio.creer.bouton')}
          </button>
        </div>
        <p className="mt-2 text-[13px] text-[var(--muted2)]">
          {t('invitations.proprio.creer.labelAide')}
        </p>

        {/* Un code sert une fois, sans expirer : c'est le cas courant, et ce
            n'est pas une question qu'on pose à qui veut juste dépanner un ami.
            Les deux réglages restent à portée pour qui en a besoin. */}
        <button
          type="button"
          onClick={() => setAvances(!avances)}
          className="mt-5 text-[13px] font-semibold text-[var(--acc2)] hover:underline"
        >
          {avances
            ? t('invitations.proprio.creer.masquer')
            : t('invitations.proprio.creer.avances')}
        </button>

        {avances ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="code-usages" className="block text-[14px] font-semibold">
                {t('invitations.proprio.creer.usages')}
              </label>
              <input
                id="code-usages"
                type="number"
                min={0}
                max={1000}
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                className="field mt-2 w-full"
              />
              <p className="mt-2 text-[13px] text-[var(--muted2)]">
                {t('invitations.proprio.creer.usagesAide')}
              </p>
            </div>
            <div>
              <label htmlFor="code-jours" className="block text-[14px] font-semibold">
                {t('invitations.proprio.creer.jours')}
              </label>
              <input
                id="code-jours"
                type="number"
                min={0}
                max={365}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="field mt-2 w-full"
              />
              <p className="mt-2 text-[13px] text-[var(--muted2)]">
                {t('invitations.proprio.creer.joursAide')}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Les codes ------------------------------------------------------- */}
      <div className="card p-[22px]">
        <h3 className="text-[16px] font-bold">{t('invitations.proprio.codes.titre')}</h3>
        {state.codes.length === 0 ? (
          <p className="mt-3 text-[14px] text-[var(--mut)]">
            {t('invitations.proprio.codes.aucun')}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {state.codes.map((code) => (
              <li
                key={code.id}
                className="rounded-[14px] border border-[var(--bd)] p-[14px]"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="code text-[15px] tracking-[0.12em]">{code.code}</span>
                  {code.problem ? (
                    <span className="text-[13px] font-semibold text-[#fca5a5]">
                      {t(`invitations.proprio.etats.${code.problem}`)}
                    </span>
                  ) : null}
                  {code.label ? (
                    <span className="text-[13px] text-[var(--mut)]">{code.label}</span>
                  ) : null}
                </div>
                <p className="mt-2 text-[13px] text-[var(--muted2)]">
                  {usageLabel(code)}
                  {code.pending > 0
                    ? ` · ${t('invitations.proprio.codes.reserve', { n: code.pending })}`
                    : ''}
                  {code.expiresAt
                    ? ` · ${t('invitations.proprio.codes.expire', {
                        date: formatDateTime(format, code.expiresAt, timeZone),
                      })}`
                    : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <SmallButton onClick={() => copy(code.code)}>
                    {copied === code.code
                      ? t('invitations.proprio.codes.copie')
                      : t('invitations.proprio.codes.copier')}
                  </SmallButton>
                  <SmallButton
                    onClick={() => run(() => revokeCodeAction(code.id, !code.revokedAt))}
                    disabled={pending}
                  >
                    {code.revokedAt
                      ? t('invitations.proprio.codes.retablir')
                      : t('invitations.proprio.codes.revoquer')}
                  </SmallButton>
                  <SmallButton
                    danger
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(t('invitations.proprio.codes.confirmer'))) return;
                      run(() => deleteCodeAction(code.id));
                    }}
                  >
                    {t('invitations.proprio.codes.supprimer')}
                  </SmallButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const serveurs = (
    <div className="card p-[22px]">
      <h3 className="text-[16px] font-bold">{t('invitations.proprio.serveurs.titre')}</h3>
      <p className="mt-2 max-w-[680px] text-[14px] leading-[1.6] text-[var(--mut)]">
        {t('invitations.proprio.serveurs.aide')}
      </p>
      {state.guilds.length === 0 ? (
        <p className="mt-3 text-[14px] text-[var(--mut)]">
          {t('invitations.proprio.serveurs.aucun')}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {state.guilds.map((guild) => (
            <li key={guild.guildId} className="rounded-[14px] border border-[var(--bd)] p-[14px]">
              <div className="flex flex-wrap items-center gap-3">
                {guild.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={guild.icon} alt="" className="h-10 w-10 shrink-0 rounded-[12px]" />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-gradient-to-br from-[var(--acc)] to-[var(--acc2)] text-[15px] font-bold text-white">
                    {guild.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{guild.name}</p>
                  {/* Où est le bot, et ce qu'est ce serveur : sa taille et qui
                      le possède disent en une ligne s'il ressemble à ce pour
                      quoi le code avait été donné. */}
                  <p
                    className="mt-[2px] text-[13px]"
                    style={{ color: guild.present ? '#34d399' : 'var(--muted2)' }}
                  >
                    {guild.present
                      ? t('invitations.proprio.serveurs.present')
                      : t('invitations.proprio.serveurs.absent')}
                    {typeof guild.members === 'number'
                      ? ` · ${t('invitations.proprio.serveurs.membres', { n: guild.members })}`
                      : ''}
                    {guild.owner || guild.ownerId
                      ? ` · ${t('invitations.proprio.serveurs.proprietaire', {
                          qui: guild.owner ?? guild.ownerId ?? '',
                        })}`
                      : ''}
                  </p>
                </div>
              </div>

              {/* Un blocage se dit en premier : il change le sens de tout ce
                  qui suit, y compris des boutons. */}
              {guild.blocked ? (
                <p className="mt-2 text-[13px] font-semibold text-[#fca5a5]">
                  {t('invitations.proprio.serveurs.bloque', {
                    date: formatDateTime(format, guild.blockedAt, timeZone),
                  })}
                  {guild.blockedReason ? ` · ${guild.blockedReason}` : ''}
                </p>
              ) : null}

              <p className="mt-2 text-[13px] text-[var(--muted2)]">{guildDetails(guild)}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                <SmallButton onClick={() => copy(guild.guildId)}>
                  {copied === guild.guildId
                    ? t('invitations.proprio.serveurs.copie')
                    : t('invitations.proprio.serveurs.copierId')}
                </SmallButton>
                {/* Faire partir le bot. Le geste retire aussi l'autorisation
                    quand il y en a une — la laisser derrière rouvrirait la
                    porte à ce serveur-là pour rien. */}
                {guild.present ? (
                  <SmallButton
                    danger
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(t('invitations.proprio.serveurs.confirmerQuitter'))) return;
                      run(() =>
                        setGuildAction({ guildId: guild.guildId, allowed: false, leave: true }),
                      );
                    }}
                  >
                    {estAutorise(guild)
                      ? t('invitations.proprio.serveurs.retirerEtQuitter')
                      : t('invitations.proprio.serveurs.quitter')}
                  </SmallButton>
                ) : null}
                {/* Retirer l'autorisation sans faire partir le bot : elle ne
                    sert qu'à une PROCHAINE entrée, et n'a donc de sens à part
                    que pour un serveur qu'il a déjà quitté. */}
                {estAutorise(guild) ? (
                  <SmallButton
                    danger={!guild.present}
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(t('invitations.proprio.serveurs.confirmer'))) return;
                      run(() => setGuildAction({ guildId: guild.guildId, allowed: false }));
                    }}
                  >
                    {t('invitations.proprio.serveurs.retirer')}
                  </SmallButton>
                ) : null}
                {/* Bloquer est le seul geste qui dure : partir ne vaut qu'un
                    instant tant que la porte reste ouverte. Le motif s'écrit
                    d'abord, d'où un dépliant plutôt qu'un bouton sec. */}
                {guild.blocked ? (
                  <SmallButton
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(t('invitations.proprio.serveurs.confirmerDebloquer'))) return;
                      run(() => setGuildBlockAction({ guildId: guild.guildId, blocked: false }));
                    }}
                  >
                    {t('invitations.proprio.serveurs.debloquer')}
                  </SmallButton>
                ) : (
                  <SmallButton
                    danger
                    disabled={pending}
                    onClick={() =>
                      setBlocage(blocage === guild.guildId ? null : guild.guildId)
                    }
                  >
                    {t('invitations.proprio.serveurs.bloquer')}
                  </SmallButton>
                )}
              </div>

              {blocage === guild.guildId && !guild.blocked ? (
                <div className="mt-3 rounded-[12px] border border-[rgba(248,113,113,.32)] bg-[rgba(248,113,113,.06)] p-[12px]">
                  <label
                    htmlFor={`motif-${guild.guildId}`}
                    className="block text-[14px] font-semibold"
                  >
                    {t('invitations.proprio.serveurs.motifLabel')}
                  </label>
                  <input
                    id={`motif-${guild.guildId}`}
                    value={motifs[guild.guildId] ?? ''}
                    onChange={(e) => setMotifs({ ...motifs, [guild.guildId]: e.target.value })}
                    placeholder={t('invitations.proprio.serveurs.motifPlaceholder')}
                    maxLength={300}
                    className="field mt-2 w-full"
                  />
                  <p className="mt-2 text-[13px] text-[var(--muted2)]">
                    {t('invitations.proprio.serveurs.motifAide')}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <SmallButton
                      danger
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(t('invitations.proprio.serveurs.confirmerBloquer'))) return;
                        const motif = (motifs[guild.guildId] ?? '').trim();
                        setBlocage(null);
                        run(() =>
                          setGuildBlockAction({
                            guildId: guild.guildId,
                            blocked: true,
                            reason: motif,
                            // Bloquer un serveur où le bot est encore, c'est
                            // l'en faire sortir : le laisser dedans ne
                            // bloquerait que son retour.
                            leave: guild.present,
                          }),
                        );
                      }}
                    >
                      {guild.present
                        ? t('invitations.proprio.serveurs.bloquerEtQuitter')
                        : t('invitations.proprio.serveurs.bloquerSeul')}
                    </SmallButton>
                    <SmallButton onClick={() => setBlocage(null)}>
                      {t('invitations.proprio.serveurs.annuler')}
                    </SmallButton>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const panels: { id: string; label: ReactNode; node: ReactNode }[] = [
    {
      id: 'demandes',
      label: (
        <>
          {t('invitations.proprio.onglets.demandes')}
          {enAttente > 0 ? (
            <span className="ml-2 rounded-full bg-[var(--acc)] px-[7px] py-[1px] text-[12px] font-bold text-white">
              {enAttente}
            </span>
          ) : null}
        </>
      ),
      node: listeDemandes,
    },
    { id: 'codes', label: t('invitations.proprio.onglets.codes'), node: codes },
    { id: 'serveurs', label: t('invitations.proprio.onglets.serveurs'), node: serveurs },
    { id: 'reglages', label: t('invitations.proprio.onglets.reglages'), node: porte },
  ];

  return (
    <section>
      {/* Le code fraîchement tiré, en grand et copiable, AU-DESSUS des
          onglets : il peut venir du générateur comme d'une demande à laquelle
          on vient de répondre, et il n'a pas à être cherché dans l'onglet
          d'où il n'est pas parti. */}
      {nouveau ? (
        <div className="flex flex-wrap items-center gap-4 rounded-[14px] border border-[rgba(52,211,153,.32)] bg-[rgba(52,211,153,.06)] p-[16px]">
          <div>
            <p className="text-[13px] font-semibold text-[#34d399]">
              {t('invitations.proprio.creer.nouveau', { nom: nouveau.label })}
            </p>
            <p className="code mt-2 inline-block text-[20px] tracking-[0.14em]">{nouveau.code}</p>
          </div>
          <SmallButton onClick={() => copy(nouveau.code)}>
            {copied === nouveau.code
              ? t('invitations.proprio.codes.copie')
              : t('invitations.proprio.codes.copier')}
          </SmallButton>
        </div>
      ) : null}

      <div
        className={`flex flex-wrap gap-2 ${nouveau ? 'mt-6' : ''}`}
        role="tablist"
        aria-label={t('invitations.proprio.sections')}
      >
        {panels.map((panel) => {
          const active = panel.id === onglet;
          return (
            <button
              key={panel.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setOnglet(panel.id)}
              className={`rounded-[10px] border px-[14px] py-[8px] text-[14px] font-semibold transition-colors ${
                active
                  ? 'border-[var(--acc-bd)] bg-[var(--acc-bg)] text-[var(--tx)]'
                  : 'border-[var(--bd)] bg-[var(--surf)] text-[var(--mut)] hover:text-[var(--tx)]'
              }`}
            >
              {panel.label}
            </button>
          );
        })}
      </div>

      {/* Masqués plutôt que démontés : le nom tapé dans le générateur ou
          l'adresse en cours d'édition survivent à un passage par un autre
          onglet. */}
      <div className="mt-5">
        {panels.map((panel) => (
          <div key={panel.id} hidden={panel.id !== onglet}>
            {panel.node}
          </div>
        ))}
      </div>

      {error ? <p className="mt-4 text-[14px] text-[#fca5a5]">{error}</p> : null}
    </section>
  );
}
