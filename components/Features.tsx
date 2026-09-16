'use client';

import { categories } from '@/lib/modules';
import { useT } from './I18n';

/** Section « Modules » : catégories + grilles de cartes module. */
export function Features() {
  const { t } = useT();

  return (
    <section id="modules" className="container-site scroll-mt-20 px-6 pb-6 pt-[96px]">
      <div className="mx-auto max-w-[640px] text-center">
        <h2 className="font-display text-[32px] font-bold tracking-[-0.02em] sm:text-[40px]">
          {t('catalogue.titre')}
        </h2>
        <p className="mt-4 text-[17px] text-[var(--mut)]">{t('catalogue.intro')}</p>
      </div>

      <div className="mt-14 flex flex-col gap-[52px]">
        {categories.map((category) => (
          <div key={category.id}>
            <div className="mb-[22px] flex items-center gap-[14px]">
              <span className="grid h-12 w-12 place-items-center rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] text-[24px]">
                {category.emoji}
              </span>
              <div>
                <h3 className="font-display text-[22px] font-semibold">
                  {t(`catalogue.categories.${category.id}.titre`)}
                </h3>
                <p className="mt-[3px] text-[14px] text-[var(--mut)]">
                  {t(`catalogue.categories.${category.id}.accroche`)}
                </p>
              </div>
            </div>
            <div className="grid gap-[14px] sm:grid-cols-2 lg:grid-cols-3">
              {category.modules.map((id) => (
                <div
                  key={id}
                  className="rounded-[16px] border border-[var(--bd)] bg-[var(--surf)] p-[18px] transition-all duration-200 hover:-translate-y-[3px] hover:border-[var(--acc)] hover:bg-[var(--surf-hover)]"
                >
                  <h4 className="text-[16px] font-semibold text-[var(--tx)]">
                    {t(`catalogue.modules.${id}.nom`)}
                  </h4>
                  <p className="mt-[7px] text-[14px] leading-[1.5] text-[var(--mut)]">
                    {t(`catalogue.modules.${id}.description`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
