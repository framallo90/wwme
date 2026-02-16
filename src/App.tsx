import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

import AppShell from './app/AppShell';
import AIPanel from './components/AIPanel';
import BookFoundationPanel from './components/BookFoundationPanel';
import CoverView from './components/CoverView';
import EditorPane from './components/EditorPane';
import OutlineView from './components/OutlineView';
import SettingsPanel from './components/SettingsPanel';
import Sidebar from './components/Sidebar';
import type { TiptapEditorHandle } from './components/TiptapEditor';
import { DEFAULT_APP_CONFIG } from './lib/config';
import { exportBookMarkdownByChapter, exportBookMarkdownSingleFile, exportChapterMarkdown } from './lib/export';
import { generateWithOllama } from './lib/ollamaClient';
import { AI_ACTIONS, buildActionPrompt, buildAutoRewritePrompt, buildChatPrompt } from './lib/prompts';
import {
  clearCoverImage,
  createBookProject,
  createChapter,
  deleteChapter,
  duplicateChapter,
  getCoverAbsolutePath,
  loadAppConfig,
  loadBookProject,
  moveChapter,
  renameChapter,
  restoreLastSnapshot,
  saveAppConfig,
  saveBookMetadata,
  saveChapter,
  saveChapterSnapshot,
  setCoverImage,
  updateBookChats,
} from './lib/storage';
import { getNowIso, normalizeAiOutput, plainTextToHtml, randomId, stripHtml } from './lib/text';
import type { AppConfig, BookProject, ChatMessage, ChatScope, MainView } from './types/book';

import './App.css';

function buildBookContext(book: BookProject, chaptersOverride?: BookProject['chapters']): string {
  const chapters = chaptersOverride ?? book.chapters;
  return book.metadata.chapterOrder
    .map((chapterId, index) => {
      const chapter = chapters[chapterId];
      if (!chapter) {
        return '';
      }
      return `Capitulo ${index + 1}: ${chapter.title}\n${stripHtml(chapter.content)}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function App() {
  const editorRef = useRef<TiptapEditorHandle | null>(null);
  const dirtyRef = useRef(false);
  const saveInFlightRef = useRef(false);

  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [book, setBook] = useState<BookProject | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [mainView, setMainView] = useState<MainView>('editor');
  const [status, setStatus] = useState('Listo.');
  const [aiBusy, setAiBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [chatScope, setChatScope] = useState<ChatScope>('chapter');
  const [coverSrc, setCoverSrc] = useState<string | null>(null);

  const orderedChapters = useMemo(() => {
    if (!book) {
      return [];
    }

    return book.metadata.chapterOrder
      .map((chapterId) => book.chapters[chapterId])
      .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter));
  }, [book]);

  const activeChapter = useMemo(() => {
    if (!book || !activeChapterId) {
      return null;
    }

    return book.chapters[activeChapterId] ?? null;
  }, [activeChapterId, book]);

  const currentMessages = useMemo(() => {
    if (!book) {
      return [] as ChatMessage[];
    }

    if (chatScope === 'book') {
      return book.metadata.chats.book;
    }

    if (!activeChapterId) {
      return [] as ChatMessage[];
    }

    return book.metadata.chats.chapters[activeChapterId] ?? [];
  }, [book, chatScope, activeChapterId]);

  const refreshCover = useCallback((project: BookProject | null) => {
    if (!project) {
      setCoverSrc(null);
      return;
    }

    const absolutePath = getCoverAbsolutePath(project.path, project.metadata);
    if (!absolutePath) {
      setCoverSrc(null);
      return;
    }

    setCoverSrc(`${convertFileSrc(absolutePath)}?v=${Date.now()}`);
  }, []);

  useEffect(() => {
    if (!book) {
      setActiveChapterId(null);
      return;
    }

    if (!activeChapterId || !book.chapters[activeChapterId]) {
      setActiveChapterId(book.metadata.chapterOrder[0] ?? null);
    }
  }, [book, activeChapterId]);

  const flushChapterSave = useCallback(async () => {
    if (!book || !activeChapterId || !dirtyRef.current || saveInFlightRef.current) {
      return;
    }

    const chapter = book.chapters[activeChapterId];
    if (!chapter) {
      return;
    }

    saveInFlightRef.current = true;
    try {
      const saved = await saveChapter(book.path, chapter);
      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          chapters: {
            ...previous.chapters,
            [saved.id]: saved,
          },
        };
      });
      dirtyRef.current = false;
      setStatus(`Guardado automatico ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      setStatus(`Error al guardar: ${(error as Error).message}`);
    } finally {
      saveInFlightRef.current = false;
    }
  }, [book, activeChapterId]);

  useEffect(() => {
    if (!book || !activeChapterId) {
      return;
    }

    const timer = window.setInterval(() => {
      void flushChapterSave();
    }, Math.max(1200, config.autosaveIntervalMs));

    return () => {
      window.clearInterval(timer);
    };
  }, [book, activeChapterId, config.autosaveIntervalMs, flushChapterSave]);

  const loadProject = useCallback(
    async (projectPath: string) => {
      const loaded = await loadBookProject(projectPath);
      const loadedConfig = await loadAppConfig(loaded.path);
      setBook(loaded);
      setConfig(loadedConfig);
      setActiveChapterId(loaded.metadata.chapterOrder[0] ?? null);
      setMainView('editor');
      setFeedback('');
      setStatus(`Libro abierto: ${loaded.metadata.title}`);
      refreshCover(loaded);
    },
    [refreshCover],
  );

  const handleCreateBook = useCallback(async () => {
    const title = window.prompt('Titulo del libro', 'Mi libro')?.trim();
    if (!title) {
      return;
    }

    const author = window.prompt('Autor', 'Autor')?.trim() || 'Autor';

    try {
      const selectedDirectory = await open({
        directory: true,
        multiple: false,
        recursive: true,
        title: 'Selecciona carpeta padre del libro',
      });

      if (!selectedDirectory || Array.isArray(selectedDirectory)) {
        return;
      }

      const created = await createBookProject(selectedDirectory, title, author);
      const loadedConfig = await loadAppConfig(created.path);
      setBook(created);
      setConfig(loadedConfig);
      setActiveChapterId(created.metadata.chapterOrder[0] ?? null);
      setMainView('editor');
      setFeedback('');
      refreshCover(created);
      setStatus(`Libro creado en ${created.path}`);
    } catch (error) {
      setStatus(`No se pudo crear el libro: ${(error as Error).message}`);
    }
  }, [refreshCover]);

  const handleOpenBook = useCallback(async () => {
    try {
      const selectedDirectory = await open({
        directory: true,
        multiple: false,
        recursive: true,
        title: 'Selecciona carpeta del libro',
      });

      if (!selectedDirectory || Array.isArray(selectedDirectory)) {
        return;
      }

      await loadProject(selectedDirectory);
    } catch (error) {
      setStatus(`No se pudo abrir el libro: ${(error as Error).message}`);
    }
  }, [loadProject]);

  const handleEditorChange = useCallback(
    (payload: { html: string; json: unknown }) => {
      if (!book || !activeChapterId) {
        return;
      }

      dirtyRef.current = true;

      setBook((previous) => {
        if (!previous || !activeChapterId) {
          return previous;
        }

        const chapter = previous.chapters[activeChapterId];
        if (!chapter) {
          return previous;
        }

        return {
          ...previous,
          chapters: {
            ...previous.chapters,
            [activeChapterId]: {
              ...chapter,
              content: payload.html,
              contentJson: payload.json,
              updatedAt: getNowIso(),
            },
          },
        };
      });
    },
    [book, activeChapterId],
  );

  const handleSaveSettings = useCallback(async () => {
    if (!book) {
      setStatus('Abri un libro para guardar config en mi-libro/config.json.');
      return;
    }

    try {
      await saveAppConfig(book.path, config);
      setStatus('Settings guardados en config.json del libro.');
    } catch (error) {
      setStatus(`Error guardando settings: ${(error as Error).message}`);
    }
  }, [book, config]);

  const handleFoundationChange = useCallback(
    (foundation: BookProject['metadata']['foundation']) => {
      if (!book) {
        return;
      }

      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          metadata: {
            ...previous.metadata,
            foundation,
          },
        };
      });
    },
    [book],
  );

  const handleSaveFoundation = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const savedMetadata = await saveBookMetadata(book.path, book.metadata);
      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          metadata: savedMetadata,
        };
      });
      setStatus('Base del libro guardada.');
    } catch (error) {
      setStatus(`No se pudo guardar la base: ${(error as Error).message}`);
    }
  }, [book]);

  const handleCreateChapter = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const title = window.prompt('Titulo del nuevo capitulo', 'Nuevo capitulo')?.trim() || 'Nuevo capitulo';
      const result = await createChapter(book.path, book.metadata, title);

      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          metadata: result.metadata,
          chapters: {
            ...previous.chapters,
            [result.chapter.id]: result.chapter,
          },
        };
      });

      setActiveChapterId(result.chapter.id);
      setMainView('editor');
      setStatus(`Capitulo creado: ${result.chapter.title}`);
    } catch (error) {
      setStatus(`No se pudo crear el capitulo: ${(error as Error).message}`);
    }
  }, [book]);

  const handleRenameChapter = useCallback(
    async (chapterId: string) => {
      if (!book) {
        return;
      }

      const chapter = book.chapters[chapterId];
      if (!chapter) {
        return;
      }

      const nextTitle = window.prompt('Nuevo titulo', chapter.title)?.trim();
      if (!nextTitle) {
        return;
      }

      try {
        const updated = await renameChapter(book.path, chapter, nextTitle);
        setBook((previous) => {
          if (!previous || previous.path !== book.path) {
            return previous;
          }

          return {
            ...previous,
            chapters: {
              ...previous.chapters,
              [chapterId]: updated,
            },
          };
        });

        setStatus('Capitulo renombrado.');
      } catch (error) {
        setStatus(`No se pudo renombrar: ${(error as Error).message}`);
      }
    },
    [book],
  );

  const handleDuplicateChapter = useCallback(
    async (chapterId: string) => {
      if (!book) {
        return;
      }

      const chapter = book.chapters[chapterId];
      if (!chapter) {
        return;
      }

      try {
        const result = await duplicateChapter(book.path, book.metadata, chapter);
        setBook((previous) => {
          if (!previous || previous.path !== book.path) {
            return previous;
          }

          return {
            ...previous,
            metadata: result.metadata,
            chapters: {
              ...previous.chapters,
              [result.chapter.id]: result.chapter,
            },
          };
        });
        setStatus('Capitulo duplicado.');
      } catch (error) {
        setStatus(`No se pudo duplicar: ${(error as Error).message}`);
      }
    },
    [book],
  );

  const handleDeleteChapter = useCallback(
    async (chapterId: string) => {
      if (!book) {
        return;
      }

      if (book.metadata.chapterOrder.length <= 1) {
        setStatus('Debe quedar al menos un capitulo.');
        return;
      }

      try {
        const metadata = await deleteChapter(book.path, book.metadata, chapterId);
        setBook((previous) => {
          if (!previous || previous.path !== book.path) {
            return previous;
          }

          const nextChapters = { ...previous.chapters };
          delete nextChapters[chapterId];

          return {
            ...previous,
            metadata,
            chapters: nextChapters,
          };
        });

        if (activeChapterId === chapterId) {
          setActiveChapterId(metadata.chapterOrder[0] ?? null);
        }

        setStatus('Capitulo eliminado.');
      } catch (error) {
        setStatus(`No se pudo eliminar: ${(error as Error).message}`);
      }
    },
    [book, activeChapterId],
  );

  const handleMoveChapter = useCallback(
    async (chapterId: string, direction: 'up' | 'down') => {
      if (!book) {
        return;
      }

      try {
        const metadata = await moveChapter(book.path, book.metadata, chapterId, direction);
        setBook((previous) => {
          if (!previous || previous.path !== book.path) {
            return previous;
          }

          return {
            ...previous,
            metadata,
          };
        });
      } catch (error) {
        setStatus(`No se pudo mover: ${(error as Error).message}`);
      }
    },
    [book],
  );

  const persistScopeMessages = useCallback(
    async (scope: ChatScope, messages: ChatMessage[]) => {
      if (!book) {
        return;
      }

      const nextChats = {
        ...book.metadata.chats,
        chapters: {
          ...book.metadata.chats.chapters,
        },
      };

      if (scope === 'book') {
        nextChats.book = messages;
      } else if (activeChapterId) {
        nextChats.chapters[activeChapterId] = messages;
      }

      const nextMetadata = await updateBookChats(book.path, book.metadata, nextChats);
      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          metadata: nextMetadata,
        };
      });
    },
    [book, activeChapterId],
  );

  const handleSendChat = useCallback(
    async (message: string, scope: ChatScope) => {
      if (!book) {
        return;
      }

      const history =
        scope === 'book' ? book.metadata.chats.book : book.metadata.chats.chapters[activeChapterId ?? ''] ?? [];

      const userMessage: ChatMessage = {
        id: randomId('msg'),
        role: 'user',
        scope,
        content: message,
        createdAt: getNowIso(),
      };
      const withUser = [...history, userMessage];

      setAiBusy(true);
      setStatus('Consultando Ollama...');

      try {
        await persistScopeMessages(scope, withUser);

        const chapterText = activeChapter ? stripHtml(activeChapter.content) : '';
        const compactHistory = history
          .slice(-8)
          .map((item) => `${item.role === 'user' ? 'Usuario' : 'Asistente'}: ${item.content}`)
          .join('\n');

        if (!config.autoApplyChatChanges) {
          const prompt = buildChatPrompt({
            scope,
            message,
            bookTitle: book.metadata.title,
            foundation: book.metadata.foundation,
            chapterTitle: activeChapter?.title,
            chapterText,
            fullBookText: buildBookContext(book),
            compactHistory,
          });

          const answer = normalizeAiOutput(
            await generateWithOllama({
              config,
              prompt,
            }),
          );

          const assistantMessage: ChatMessage = {
            id: randomId('msg'),
            role: 'assistant',
            scope,
            content: answer,
            createdAt: getNowIso(),
          };

          await persistScopeMessages(scope, [...withUser, assistantMessage]);
          setStatus('Respuesta IA recibida.');
          return;
        }

        const iterations = Math.max(1, Math.min(10, config.chatApplyIterations));

        if (scope === 'chapter') {
          if (!activeChapterId) {
            throw new Error('No hay capitulo activo para aplicar cambios.');
          }

          let workingChapters: BookProject['chapters'] = { ...book.chapters };
          let chapter = workingChapters[activeChapterId];

          if (!chapter) {
            throw new Error('No se encontro el capitulo activo.');
          }

          let lastResponse = '';

          for (let iteration = 1; iteration <= iterations; iteration += 1) {
            if (config.autoVersioning) {
              await saveChapterSnapshot(book.path, chapter, `Chat auto-aplicar ${iteration}/${iterations}`);
            }

            const prompt = buildAutoRewritePrompt({
              userInstruction: message,
              bookTitle: book.metadata.title,
              foundation: book.metadata.foundation,
              chapterTitle: chapter.title,
              chapterText: stripHtml(chapter.content),
              fullBookText: buildBookContext(book, workingChapters),
              chapterIndex: book.metadata.chapterOrder.indexOf(chapter.id) + 1,
              chapterTotal: book.metadata.chapterOrder.length,
              iteration,
              totalIterations: iterations,
            });

            lastResponse = normalizeAiOutput(
              await generateWithOllama({
                config,
                prompt,
              }),
            );

            const chapterDraft = {
              ...chapter,
              content: plainTextToHtml(lastResponse),
              contentJson: null,
              updatedAt: getNowIso(),
            };
            chapter = await saveChapter(book.path, chapterDraft);
            workingChapters = {
              ...workingChapters,
              [chapter.id]: chapter,
            };

            setStatus(`Aplicando cambios al capitulo (${iteration}/${iterations})...`);
          }

          setBook((previous) => {
            if (!previous || previous.path !== book.path) {
              return previous;
            }

            return {
              ...previous,
              chapters: workingChapters,
            };
          });

          dirtyRef.current = false;

          const assistantMessage: ChatMessage = {
            id: randomId('msg'),
            role: 'assistant',
            scope,
            content: lastResponse,
            createdAt: getNowIso(),
          };

          await persistScopeMessages(scope, [...withUser, assistantMessage]);
          setStatus('Chat aplicado automaticamente al capitulo.');
          return;
        }

        let workingChapters: BookProject['chapters'] = { ...book.chapters };

        for (let iteration = 1; iteration <= iterations; iteration += 1) {
          for (let index = 0; index < book.metadata.chapterOrder.length; index += 1) {
            const chapterId = book.metadata.chapterOrder[index];
            const chapter = workingChapters[chapterId];
            if (!chapter) {
              continue;
            }

            if (config.autoVersioning) {
              await saveChapterSnapshot(
                book.path,
                chapter,
                `Chat auto-aplicar libro cap ${index + 1} iter ${iteration}/${iterations}`,
              );
            }

            const prompt = buildAutoRewritePrompt({
              userInstruction: message,
              bookTitle: book.metadata.title,
              foundation: book.metadata.foundation,
              chapterTitle: chapter.title,
              chapterText: stripHtml(chapter.content),
              fullBookText: buildBookContext(book, workingChapters),
              chapterIndex: index + 1,
              chapterTotal: book.metadata.chapterOrder.length,
              iteration,
              totalIterations: iterations,
            });

            const response = normalizeAiOutput(
              await generateWithOllama({
                config,
                prompt,
              }),
            );

            const chapterDraft = {
              ...chapter,
              content: plainTextToHtml(response),
              contentJson: null,
              updatedAt: getNowIso(),
            };
            const persisted = await saveChapter(book.path, chapterDraft);
            workingChapters = {
              ...workingChapters,
              [chapterId]: persisted,
            };

            setStatus(
              `Aplicando cambios al libro: cap ${index + 1}/${book.metadata.chapterOrder.length}, iter ${iteration}/${iterations}...`,
            );
          }
        }

        setBook((previous) => {
          if (!previous || previous.path !== book.path) {
            return previous;
          }

          return {
            ...previous,
            chapters: workingChapters,
          };
        });

        dirtyRef.current = false;

        const assistantMessage: ChatMessage = {
          id: randomId('msg'),
          role: 'assistant',
          scope,
          content: `Cambios aplicados automaticamente en todo el libro (${book.metadata.chapterOrder.length} capitulos, ${iterations} iteracion/es).`,
          createdAt: getNowIso(),
        };

        await persistScopeMessages(scope, [...withUser, assistantMessage]);
        setStatus('Chat aplicado automaticamente al libro completo.');
      } catch (error) {
        setStatus(`Error de IA: ${(error as Error).message}`);
      } finally {
        setAiBusy(false);
      }
    },
    [book, activeChapter, activeChapterId, config, persistScopeMessages],
  );

  const handleRunAction = useCallback(
    async (actionId: (typeof AI_ACTIONS)[number]['id']) => {
      if (!book || !activeChapter) {
        return;
      }

      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const allowEmptyTargetActions = new Set(['feedback-book', 'feedback-chapter', 'draft-from-idea']);
      const hasSelection = editor.hasSelection();
      const selectedText = hasSelection ? editor.getSelectionText() : editor.getDocumentText();
      if (!selectedText.trim() && !allowEmptyTargetActions.has(actionId)) {
        setStatus('No hay texto para procesar.');
        return;
      }

      const prompt = buildActionPrompt({
        actionId,
        selectedText,
        chapterTitle: activeChapter.title,
        bookTitle: book.metadata.title,
        foundation: book.metadata.foundation,
        chapterContext: stripHtml(activeChapter.content),
        fullBookContext: buildBookContext(book),
      });

      setAiBusy(true);
      setStatus('Aplicando accion IA...');

      try {
        const action = AI_ACTIONS.find((item) => item.id === actionId);
        if (action?.modifiesText && config.autoVersioning) {
          await saveChapterSnapshot(book.path, activeChapter, action.label);
        }

        const response = normalizeAiOutput(
          await generateWithOllama({
            config,
            prompt,
          }),
        );

        if (action?.modifiesText) {
          if (hasSelection) {
            editor.replaceSelectionWithText(response);
          } else {
            editor.replaceDocumentWithText(response);
          }

          const nextHtml = editor.getHTML();
          const nextJson = editor.getJSON();
          const updatedChapter = {
            ...activeChapter,
            content: nextHtml,
            contentJson: nextJson,
            updatedAt: getNowIso(),
          };
          const persistedChapter = await saveChapter(book.path, updatedChapter);
          dirtyRef.current = false;

          setBook((previous) => {
            if (!previous || previous.path !== book.path) {
              return previous;
            }

            return {
              ...previous,
              chapters: {
                ...previous.chapters,
                [activeChapter.id]: persistedChapter,
              },
            };
          });

          setStatus(`Accion aplicada: ${action?.label ?? actionId}`);
        } else {
          setFeedback(response);
          setStatus(`Devolucion lista: ${action?.label ?? actionId}`);
        }
      } catch (error) {
        setStatus(`Error IA: ${(error as Error).message}`);
      } finally {
        setAiBusy(false);
      }
    },
    [book, activeChapter, config],
  );

  const handleUndo = useCallback(async () => {
    if (!book || !activeChapter) {
      return;
    }

    try {
      const restored = await restoreLastSnapshot(book.path, activeChapter.id);
      if (!restored) {
        setStatus('No hay snapshots para restaurar.');
        return;
      }

      setBook((previous) => {
        if (!previous || previous.path !== book.path) {
          return previous;
        }

        return {
          ...previous,
          chapters: {
            ...previous.chapters,
            [restored.id]: restored,
          },
        };
      });

      dirtyRef.current = false;
      setStatus('Undo aplicado desde snapshot.');
    } catch (error) {
      setStatus(`No se pudo restaurar snapshot: ${(error as Error).message}`);
    }
  }, [book, activeChapter]);

  const handlePickCover = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const selected = await open({
        multiple: false,
        title: 'Selecciona portada',
        filters: [
          {
            name: 'Imagenes',
            extensions: ['png', 'jpg', 'jpeg', 'webp'],
          },
        ],
      });

      if (!selected || Array.isArray(selected)) {
        return;
      }

      const metadata = await setCoverImage(book.path, book.metadata, selected);
      const updated: BookProject = {
        ...book,
        metadata,
      };

      setBook(updated);
      refreshCover(updated);
      setStatus('Portada actualizada.');
    } catch (error) {
      setStatus(`No se pudo actualizar portada: ${(error as Error).message}`);
    }
  }, [book, refreshCover]);

  const handleClearCover = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const metadata = await clearCoverImage(book.path, book.metadata);
      const updated = { ...book, metadata };
      setBook(updated);
      refreshCover(updated);
      setStatus('Portada eliminada.');
    } catch (error) {
      setStatus(`No se pudo quitar portada: ${(error as Error).message}`);
    }
  }, [book, refreshCover]);

  const handleExportChapter = useCallback(async () => {
    if (!book || !activeChapter) {
      return;
    }

    try {
      const path = await exportChapterMarkdown(book.path, activeChapter);
      setStatus(`Capitulo exportado: ${path}`);
    } catch (error) {
      setStatus(`No se pudo exportar capitulo: ${(error as Error).message}`);
    }
  }, [book, activeChapter]);

  const handleExportBookSingle = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const path = await exportBookMarkdownSingleFile(book.path, book.metadata, orderedChapters);
      setStatus(`Libro exportado: ${path}`);
    } catch (error) {
      setStatus(`No se pudo exportar libro: ${(error as Error).message}`);
    }
  }, [book, orderedChapters]);

  const handleExportBookSplit = useCallback(async () => {
    if (!book) {
      return;
    }

    try {
      const files = await exportBookMarkdownByChapter(book.path, orderedChapters);
      setStatus(`Capitulos exportados: ${files.length} archivos`);
    } catch (error) {
      setStatus(`No se pudo exportar libro: ${(error as Error).message}`);
    }
  }, [book, orderedChapters]);

  const centerView = useMemo(() => {
    if (mainView === 'outline') {
      return (
        <OutlineView
          chapters={orderedChapters}
          onSelectChapter={(chapterId) => {
            setActiveChapterId(chapterId);
            setMainView('editor');
          }}
        />
      );
    }

    if (mainView === 'cover') {
      return <CoverView coverSrc={coverSrc} onPickCover={handlePickCover} onClearCover={handleClearCover} />;
    }

    if (mainView === 'foundation') {
      return (
        <BookFoundationPanel
          foundation={book?.metadata.foundation ?? {
            centralIdea: '',
            promise: '',
            audience: '',
            narrativeVoice: '',
            styleRules: '',
            structureNotes: '',
            glossaryPreferred: '',
            glossaryAvoid: '',
          }}
          onChange={handleFoundationChange}
          onSave={handleSaveFoundation}
        />
      );
    }

    if (mainView === 'settings') {
      return <SettingsPanel config={config} bookPath={book?.path ?? null} onChange={setConfig} onSave={handleSaveSettings} />;
    }

    return (
      <EditorPane
        ref={editorRef}
        chapter={activeChapter}
        autosaveIntervalMs={config.autosaveIntervalMs}
        onContentChange={handleEditorChange}
        onBlur={() => {
          void flushChapterSave();
        }}
      />
    );
  }, [
    activeChapter,
    book,
    config,
    coverSrc,
    flushChapterSave,
    handleClearCover,
    handleEditorChange,
    handleFoundationChange,
    handleSaveFoundation,
    handlePickCover,
    handleSaveSettings,
    mainView,
    orderedChapters,
  ]);

  return (
    <AppShell
      sidebar={
        <Sidebar
          hasBook={Boolean(book)}
          bookTitle={book?.metadata.title ?? 'Sin libro'}
          chapters={orderedChapters}
          activeChapterId={activeChapterId}
          currentView={mainView}
          onCreateBook={handleCreateBook}
          onOpenBook={handleOpenBook}
          onCreateChapter={handleCreateChapter}
          onRenameChapter={handleRenameChapter}
          onDuplicateChapter={handleDuplicateChapter}
          onDeleteChapter={handleDeleteChapter}
          onMoveChapter={handleMoveChapter}
          onSelectChapter={(chapterId) => {
            setActiveChapterId(chapterId);
            setMainView('editor');
          }}
          onShowEditor={() => setMainView('editor')}
          onShowOutline={() => setMainView('outline')}
          onShowCover={() => setMainView('cover')}
          onShowFoundation={() => setMainView('foundation')}
          onShowSettings={() => setMainView('settings')}
          onExportChapter={handleExportChapter}
          onExportBookSingle={handleExportBookSingle}
          onExportBookSplit={handleExportBookSplit}
        />
      }
      center={centerView}
      right={
        <AIPanel
          actions={AI_ACTIONS}
          aiBusy={aiBusy}
          feedback={feedback}
          canUndo={Boolean(book && activeChapter)}
          scope={chatScope}
          messages={currentMessages}
          autoApplyChatChanges={config.autoApplyChatChanges}
          chatApplyIterations={config.chatApplyIterations}
          onScopeChange={setChatScope}
          onRunAction={handleRunAction}
          onSendChat={handleSendChat}
          onUndo={handleUndo}
        />
      }
      status={status}
    />
  );
}

export default App;
