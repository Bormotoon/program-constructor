import { Fragment, type ReactNode } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from './ui';
import { ExportMenu } from './ExportMenu';
import { APPROVAL_LABELS, type ProgramData } from '../data/program';
import { lessonTotals } from '../data/lessonPlan';
import { planHours, sectionHours } from '../data/thematicPlan';

/**
 * Предпросмотр программы «как в Word».
 *
 * Вёрстка намеренно повторяет структуру выгружаемого DOCX (Times New Roman,
 * 14 pt, тот же порядок разделов и те же колонки таблиц), чтобы предпросмотр
 * и печать не расходились с итоговым файлом.
 */
export function ProgramPreview({ data, onBack }: { data: ProgramData; onBack: () => void }) {
  const approvalText: Record<string, string> = {
    reviewed: data.reviewedBy,
    agreed: data.agreedBy,
    approved: data.approvedBy,
  };

  const paragraphs = (text: string) =>
    text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line, i) => (
        <p key={i} className="mb-2 text-justify indent-8 first-letter:ml-0">
          {line}
        </p>
      ));

  const td = 'border border-black px-2 py-1 align-top';
  // Документ всегда чёрным по белому: это предпросмотр печати, а не интерфейс.

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Панель управления не печатается; сам документ всегда на белом фоне
          и в Times New Roman — он должен совпадать с выгружаемым DOCX
          независимо от выбранной темы интерфейса. */}
      <div className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
          <Button onClick={onBack}>
            <ArrowLeft size={15} /> К редактированию
          </Button>
          <span className="ml-auto flex gap-2">
            <Button onClick={() => window.print()}>
              <Printer size={15} /> Печать
            </Button>
            <ExportMenu data={data} />
          </span>
        </div>
      </div>

      <article
        className="mx-auto my-6 bg-white p-12 text-black shadow-lg print:my-0 print:p-0 print:shadow-none"
        style={{ fontFamily: '"Times New Roman", serif', fontSize: '14pt', maxWidth: '210mm' }}
      >
        {/* Титульный лист */}
        <section className="text-center print:break-after-page">
          {data.regionalAuthority && <p className="text-[12pt]">{data.regionalAuthority}</p>}
          {data.founder && <p className="text-[12pt]">{data.founder}</p>}
          <p className="mt-3 font-bold">{data.schoolName}</p>

          <div className="mt-10 flex justify-between gap-6 text-left text-[12pt]">
            {data.approvals.map((k) => (
              <div key={k} className="flex-1">
                <p className="font-bold">{APPROVAL_LABELS[k]}</p>
                <p>{approvalText[k]}</p>
              </div>
            ))}
          </div>

          <p className="mt-24 font-bold">РАБОЧАЯ ПРОГРАММА</p>
          <p>учебного предмета «{data.subject || '____________'}»</p>
          {data.variant && <p>({data.variant} уровень)</p>}
          <p>для {data.grade ? `${data.grade} класса` : '____ класса'}</p>
          <p>уровень образования: {data.educationLevel}</p>

          <p className="mt-16 text-[12pt] font-bold">Составитель:</p>
          <p className="text-[12pt]">{data.teacherName}</p>

          <p className="mt-16">
            {data.locality}
            {data.locality && data.year ? ', ' : ''}
            {data.year}
          </p>
          <p>{data.academicYear} учебный год</p>
        </section>

        <Section title="ПОЯСНИТЕЛЬНАЯ ЗАПИСКА">
          {paragraphs(data.normativeBase)}
        </Section>

        {data.subjectContent && (
          <Section title="СОДЕРЖАНИЕ ОБУЧЕНИЯ">{paragraphs(data.subjectContent)}</Section>
        )}

        <Section title="ПЛАНИРУЕМЫЕ РЕЗУЛЬТАТЫ ОСВОЕНИЯ ПРОГРАММЫ">
          {data.personalResults && (
            <>
              <p className="mb-2 font-bold">ЛИЧНОСТНЫЕ РЕЗУЛЬТАТЫ</p>
              {paragraphs(data.personalResults)}
            </>
          )}
          {data.metaResults && (
            <>
              <p className="mb-2 font-bold">МЕТАПРЕДМЕТНЫЕ РЕЗУЛЬТАТЫ</p>
              {paragraphs(data.metaResults)}
            </>
          )}
          {data.subjectResults && (
            <>
              <p className="mb-2 font-bold">ПРЕДМЕТНЫЕ РЕЗУЛЬТАТЫ</p>
              {paragraphs(data.subjectResults)}
            </>
          )}
        </Section>

        {data.thematicPlan.length > 0 && (
          <Section title="ТЕМАТИЧЕСКОЕ ПЛАНИРОВАНИЕ">
            {data.grade && <p className="mb-2 font-bold">{data.grade} КЛАСС</p>}
            <table className="w-full border-collapse text-[10pt]">
              <thead>
                <tr>
                  <th className={td}>№ п/п</th>
                  <th className={td}>Наименование разделов и тем учебного предмета</th>
                  <th className={td}>Количество часов</th>
                  <th className={td}>Программное содержание</th>
                  <th className={td}>Основные виды деятельности обучающихся</th>
                </tr>
              </thead>
              <tbody>
                {data.thematicPlan.map((s) => (
                  <Fragment key={s.id}>
                    {s.name && (
                      <tr>
                        <td className={`${td} font-bold`} colSpan={5}>
                          {s.name}
                        </td>
                      </tr>
                    )}
                    {s.topics.map((t) => (
                      <tr key={t.id}>
                        <td className={`${td} text-center`}>{t.num}</td>
                        <td className={td}>{t.name}</td>
                        <td className={`${td} text-center`}>{t.hours}</td>
                        <td className={td}>{t.content}</td>
                        <td className={td}>{t.activity}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className={`${td} font-bold`} colSpan={2}>
                        Итого по разделу
                      </td>
                      <td className={`${td} text-center font-bold`}>{sectionHours(s)}</td>
                      <td className={td} colSpan={2} />
                    </tr>
                  </Fragment>
                ))}
                <tr>
                  <td className={`${td} font-bold`} colSpan={2}>
                    ОБЩЕЕ КОЛИЧЕСТВО ЧАСОВ ПО ПРОГРАММЕ
                  </td>
                  <td className={`${td} text-center font-bold`}>{planHours(data.thematicPlan)}</td>
                  <td className={td} colSpan={2} />
                </tr>
              </tbody>
            </table>
          </Section>
        )}

        {data.lessonPlan.length > 0 && (
          <Section title="ПОУРОЧНОЕ ПЛАНИРОВАНИЕ">
            {data.grade && <p className="mb-2 font-bold">{data.grade} КЛАСС</p>}
            <table className="w-full border-collapse text-[10pt]">
              <thead>
                <tr>
                  <th className={td}>№ урока</th>
                  <th className={td}>Тема урока</th>
                  <th className={td}>Количество часов</th>
                  <th className={td}>Контрольные работы</th>
                  <th className={td}>Практические работы</th>
                  <th className={td}>Дата изучения</th>
                </tr>
              </thead>
              <tbody>
                {data.lessonPlan.map((l) => (
                  <tr key={l.id}>
                    <td className={`${td} text-center`}>{l.number}</td>
                    <td className={td}>{l.topic}</td>
                    <td className={`${td} text-center`}>{l.hours}</td>
                    <td className={`${td} text-center`}>{l.control || ''}</td>
                    <td className={`${td} text-center`}>{l.practice || ''}</td>
                    <td className={`${td} text-center`}>{l.date}</td>
                  </tr>
                ))}
                <tr>
                  <td className={`${td} font-bold`} colSpan={2}>
                    ОБЩЕЕ КОЛИЧЕСТВО ЧАСОВ ПО ПРОГРАММЕ
                  </td>
                  <td className={`${td} text-center font-bold`}>
                    {lessonTotals(data.lessonPlan).hours}
                  </td>
                  <td className={`${td} text-center font-bold`}>
                    {lessonTotals(data.lessonPlan).control}
                  </td>
                  <td className={`${td} text-center font-bold`}>
                    {lessonTotals(data.lessonPlan).practice}
                  </td>
                  <td className={td} />
                </tr>
              </tbody>
            </table>
          </Section>
        )}

        {data.methodologicalSupport && (
          <Section title="УЧЕБНО-МЕТОДИЧЕСКОЕ ОБЕСПЕЧЕНИЕ ОБРАЗОВАТЕЛЬНОГО ПРОЦЕССА">
            {paragraphs(data.methodologicalSupport)}
          </Section>
        )}
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 print:break-before-page">
      <h2 className="mb-4 text-center font-bold">{title}</h2>
      {children}
    </section>
  );
}
