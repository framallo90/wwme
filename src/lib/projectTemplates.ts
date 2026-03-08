import type { BookProject } from '../types/book';
import { getNowIso } from './text';

export type BookCreationTemplateId = 'blank' | 'saga';

export function applyBookCreationTemplate(project: BookProject, template: BookCreationTemplateId): BookProject {
  if (template === 'blank') {
    return project;
  }

  const primaryChapterId = project.metadata.chapterOrder[0] ?? null;
  const primaryChapter = primaryChapterId ? project.chapters[primaryChapterId] : null;
  const now = getNowIso();

  return {
    ...project,
    metadata: {
      ...project.metadata,
      foundation: {
        ...project.metadata.foundation,
        centralIdea:
          project.metadata.foundation.centralIdea.trim() || 'Conflicto fundacional de una saga coral que atraviesa eras, dinastias y fracturas de poder.',
        promise:
          project.metadata.foundation.promise.trim() ||
          'Cada volumen debe abrir, escalar y cerrar un tramo del conflicto mayor sin perder continuidad emocional ni politica.',
        structureNotes:
          project.metadata.foundation.structureNotes.trim() ||
          [
            'Dossier de saga sugerido:',
            '- Cosmogonia y eras del mundo.',
            '- Mapa politico y fronteras por volumen.',
            '- Linajes, dinastias y pactos de sangre.',
            '- Sistemas de magia, tecnologia o fe.',
            '- Hitos irreversibles entre libros.',
          ].join('\n'),
      },
      storyBible: {
        ...project.metadata.storyBible,
        continuityRules:
          project.metadata.storyBible.continuityRules.trim() ||
          [
            'Registrar cambios de poder, frontera y linaje por volumen.',
            'Toda profecia debe marcar fecha, fuente y grado de fiabilidad.',
            'Toda regla de magia o poder debe explicitar costo y limite.',
          ].join('\n'),
      },
      scratchpad:
        project.metadata.scratchpad?.trim() ||
        [
          '# Dossier de saga',
          '',
          '## Cosmogonia',
          '- Origen del mundo',
          '- Eras fundacionales',
          '',
          '## Mapa politico',
          '- Reinos, ciudades-estado, rutas y tensiones',
          '',
          '## Dinastias y genealogias',
          '- Casas principales',
          '- Herederos, bastardias, alianzas',
          '',
          '## Sistema de poder',
          '- Fuente',
          '- Costos',
          '- Limites',
          '',
          '## Semillas para volumenes futuros',
          '-',
        ].join('\n'),
      looseThreads:
        project.metadata.looseThreads && project.metadata.looseThreads.length > 0
          ? project.metadata.looseThreads
          : [
              {
                id: 'thread-template-dynasty',
                title: 'Fractura dinastica principal',
                description: 'Definir que linaje amenaza el equilibrio general de la saga.',
                status: 'open',
                chapterRef: primaryChapterId ?? undefined,
                createdAt: now,
                updatedAt: now,
              },
              {
                id: 'thread-template-prophecy',
                title: 'Profecia o verdad fundacional',
                description: 'Precisar origen, interpretaciones y costo narrativo de la profecia central.',
                status: 'open',
                chapterRef: primaryChapterId ?? undefined,
                createdAt: now,
                updatedAt: now,
              },
            ],
      updatedAt: now,
    },
    chapters:
      primaryChapterId && primaryChapter
        ? {
            ...project.chapters,
            [primaryChapterId]: {
              ...primaryChapter,
              title: primaryChapter.title === 'Capitulo 1' ? 'Prologo / Apertura' : primaryChapter.title,
              synopsis:
                primaryChapter.synopsis?.trim() ||
                'Presenta el conflicto fundacional, una herida del mundo y la promesa del arco mayor.',
              updatedAt: now,
            },
          }
        : project.chapters,
  };
}
