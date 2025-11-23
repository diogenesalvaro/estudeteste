import React, { useState, useEffect, useRef } from 'react';
import { Subject, ViewState, StudyStats, UserProfile, Concurso, StoredFile } from './types';
import SubjectCard from './components/SubjectCard';
import ChatView from './components/ChatView';
import LoginView from './components/LoginView';
import { 
  PlusIcon, 
  BookIcon, 
  ArrowLeftIcon, 
  LayoutDashboardIcon, 
  TimerIcon, 
  PlayIcon, 
  PauseIcon, 
  RotateCcwIcon,
  SearchIcon,
  ClipboardCheckIcon,
  SparklesIcon,
  BrainIcon,
  RefreshCwIcon,
  LoaderIcon,
  SettingsIcon,
  KeyIcon,
  XIcon,
  SaveIcon,
  LogOutIcon,
  BriefcaseIcon,
  UploadIcon,
  TrashIcon,
  FileTextIcon
} from './components/Icons';
import { saveFileToDB, getFileFromDB, deleteFileFromDB } from './services/storage';
import { generateFlashcards, analyzeEdict } from './services/geminiService';

const POMODORO_WORK_TIME = 25 * 60;
const POMODORO_BREAK_TIME = 5 * 60;
const STORAGE_KEY_API = 'estudemais_api_key';
const STORAGE_KEY_USER = 'estudemais_current_user';
const LOGO_URL = "https://cdn-icons-png.flaticon.com/512/2232/2232688.png";

const App: React.FC = () => {
  // --- Auth State ---
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const savedUser = localStorage.getItem(STORAGE_KEY_USER);
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  // --- Data State ---
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [concursos, setConcursos] = useState<Concurso[]>([]);
  const [stats, setStats] = useState<StudyStats>({ totalMinutes: 0, sessionsCompleted: 0, lastStudyDate: Date.now() });
  
  // --- UI State ---
  const [viewState, setViewState] = useState<ViewState>(ViewState.DASHBOARD);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedConcursoId, setSelectedConcursoId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectDesc, setNewSubjectDesc] = useState('');
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // --- Settings / API Key UI State ---
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');

  // --- Review/Flashcard UI State ---
  const [isGeneratingCards, setIsGeneratingCards] = useState(false);
  const [activeFlashcardIndex, setActiveFlashcardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);

  // --- Concursos UI State ---
  const [showConcursoModal, setShowConcursoModal] = useState(false);
  const [isAnalyzingEdict, setIsAnalyzingEdict] = useState(false);
  const [newConcursoName, setNewConcursoName] = useState('');

  // --- Pomodoro State ---
  const [timerSeconds, setTimerSeconds] = useState(POMODORO_WORK_TIME);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [isBreakMode, setIsBreakMode] = useState(false);
  const timerRef = useRef<number | null>(null);
  const edictInputRef = useRef<HTMLInputElement>(null);

  // --- Data Loading Effect (Triggered on Login) ---
  useEffect(() => {
    if (!currentUser) {
      setSubjects([]);
      setConcursos([]);
      return;
    }

    const userSubjectsKey = `estudemais-subjects-${currentUser.email}`;
    const userConcursosKey = `estudemais-concursos-${currentUser.email}`;
    const statsKey = `estudemais-stats-${currentUser.email}`;

    // Load Metadata
    try {
      const savedSubjects = localStorage.getItem(userSubjectsKey);
      const parsedSubjects = savedSubjects ? JSON.parse(savedSubjects) : [];
      
      // Schema Migration
      const subjectsWithFields = parsedSubjects.map((s: any) => ({
        ...s,
        notes: s.notes || '',
        flashcards: s.flashcards || []
      }));
      
      setSubjects(subjectsWithFields);

      const savedConcursos = localStorage.getItem(userConcursosKey);
      if (savedConcursos) {
        const parsedConcursos = JSON.parse(savedConcursos);
        // Schema Migration for Concursos
        const concursosWithFields = parsedConcursos.map((c: any) => ({
          ...c,
          messages: c.messages || []
        }));
        setConcursos(concursosWithFields);
      }

      const savedStats = localStorage.getItem(statsKey);
      if (savedStats) {
        setStats(JSON.parse(savedStats));
      } else {
        setStats({ totalMinutes: 0, sessionsCompleted: 0, lastStudyDate: Date.now() });
      }
    } catch (e) {
      console.error("Erro ao carregar dados do usuário", e);
    }
  }, [currentUser]);

  // --- Hydrate Files from DB (After Subjects/Concursos Loaded) ---
  useEffect(() => {
    if (!currentUser) return;

    const hydrateFiles = async () => {
      let updated = false;
      const updatedSubjects = await Promise.all(subjects.map(async (sub) => {
        const hydratedFiles = await Promise.all(sub.files.map(async (file) => {
          if (!file.data || file.data === "") {
            updated = true;
            const dbData = await getFileFromDB(file.id);
            return { ...file, data: dbData || "" };
          }
          return file;
        }));
        return { ...sub, files: hydratedFiles };
      }));

      const updatedConcursos = await Promise.all(concursos.map(async (conc) => {
         if (!conc.file.data || conc.file.data === "") {
           updated = true;
           const dbData = await getFileFromDB(conc.file.id);
           return { ...conc, file: { ...conc.file, data: dbData || "" }};
         }
         return conc;
      }));
      
      if (updated) {
        setSubjects(updatedSubjects);
        setConcursos(updatedConcursos);
      }
    };

    // Hydrate only if we have items but missing data (optimization)
    const needsHydration = subjects.some(s => s.files.some(f => !f.data)) || concursos.some(c => !c.file.data);
    if (needsHydration) {
        setIsLoadingFiles(true);
        hydrateFiles().finally(() => setIsLoadingFiles(false));
    }
  }, [subjects.length, concursos.length, currentUser?.email]); 

  // --- Load API Key ---
  useEffect(() => {
    const savedKey = localStorage.getItem(STORAGE_KEY_API);
    if (savedKey) {
      setApiKeyInput(savedKey);
    }
  }, []);

  // --- Persistence Effects ---
  
  // Save Subjects & Concursos
  useEffect(() => {
    if (!currentUser) return;
    
    const saveToStorage = async () => {
      try {
        // 1. Save heavy file data to IndexedDB
        for (const sub of subjects) {
          for (const file of sub.files) {
            if (file.data && file.data.length > 0) {
              await saveFileToDB({ id: file.id, data: file.data });
            }
          }
        }
        for (const conc of concursos) {
           if (conc.file.data && conc.file.data.length > 0) {
             await saveFileToDB({ id: conc.file.id, data: conc.file.data });
           }
        }

        // 2. Create lightweight version for LocalStorage
        const lightweightSubjects = subjects.map(sub => ({
          ...sub,
          files: sub.files.map(f => ({ ...f, data: "" }))
        }));

        const lightweightConcursos = concursos.map(conc => ({
           ...conc,
           file: { ...conc.file, data: "" }
        }));

        const userSubjectsKey = `estudemais-subjects-${currentUser.email}`;
        const userConcursosKey = `estudemais-concursos-${currentUser.email}`;

        localStorage.setItem(userSubjectsKey, JSON.stringify(lightweightSubjects));
        localStorage.setItem(userConcursosKey, JSON.stringify(lightweightConcursos));
        setStorageError(null);
      } catch (e: any) {
        console.error("Erro ao salvar:", e);
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          setStorageError("Armazenamento cheio! Remova arquivos antigos.");
        }
      }
    };

    const timeoutId = setTimeout(saveToStorage, 1000);
    return () => clearTimeout(timeoutId);
  }, [subjects, concursos, currentUser]);

  // Save Stats
  useEffect(() => {
    if (!currentUser) return;
    const statsKey = `estudemais-stats-${currentUser.email}`;
    localStorage.setItem(statsKey, JSON.stringify(stats));
  }, [stats, currentUser]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Timer Logic & Document Title Update
  useEffect(() => {
    // Update document title based on timer state
    if (isTimerActive) {
      const mode = isBreakMode ? 'Pausa' : 'Foco';
      document.title = `(${formatTime(timerSeconds)}) ${mode} - ESTUDE MAIS`;
    } else {
      document.title = 'ESTUDE MAIS';
    }

    if (isTimerActive) {
      timerRef.current = window.setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            // Timer finished
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerActive, isBreakMode, timerSeconds]);

  const handleTimerComplete = () => {
    setIsTimerActive(false);
    if (!isBreakMode) {
      // Work session finished
      const duration = POMODORO_WORK_TIME / 60;
      setStats(prev => ({
        ...prev,
        totalMinutes: prev.totalMinutes + duration,
        sessionsCompleted: prev.sessionsCompleted + 1,
        lastStudyDate: Date.now()
      }));
      setTimerSeconds(POMODORO_BREAK_TIME);
      setIsBreakMode(true);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification("Pomodoro Concluído!", { body: "Hora de uma pausa." });
      }
    } else {
      // Break finished
      setTimerSeconds(POMODORO_WORK_TIME);
      setIsBreakMode(false);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification("Pausa Concluída!", { body: "Volte ao foco." });
      }
    }
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const toggleTimer = () => setIsTimerActive(!isTimerActive);
  
  const resetTimer = () => {
    setIsTimerActive(false);
    setTimerSeconds(isBreakMode ? POMODORO_BREAK_TIME : POMODORO_WORK_TIME);
  };

  // --- Handlers ---

  const handleLogin = (user: UserProfile) => {
    setCurrentUser(user);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    setViewState(ViewState.DASHBOARD);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEY_USER);
    setSubjects([]);
    setConcursos([]);
    setViewState(ViewState.DASHBOARD);
    // Reset Timer
    setIsTimerActive(false);
    setTimerSeconds(POMODORO_WORK_TIME);
  };

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      localStorage.setItem(STORAGE_KEY_API, apiKeyInput.trim());
      setShowSettingsModal(false);
      alert("Chave API salva com sucesso!");
    } else {
      // Allow clearing key
      localStorage.removeItem(STORAGE_KEY_API);
      setShowSettingsModal(false);
    }
  };

  const handleCreateSubject = () => {
    if (!newSubjectName.trim()) return;
    
    const newSubject: Subject = {
      id: crypto.randomUUID(),
      name: newSubjectName,
      description: newSubjectDesc,
      files: [],
      messages: [],
      notes: '', 
      flashcards: [],
      createdAt: Date.now(),
    };
    
    setSubjects([newSubject, ...subjects]);
    setNewSubjectName('');
    setNewSubjectDesc('');
    setShowModal(false);
    setViewState(ViewState.SUBJECTS);
  };

  const handleSelectSubject = (id: string) => {
    setSelectedSubjectId(id);
    setViewState(ViewState.SUBJECT_DETAIL);
  };

  const handleSelectSubjectForReview = (id: string) => {
    setSelectedSubjectId(id);
    setActiveFlashcardIndex(0);
    setIsCardFlipped(false);
  };
  
  const handleSelectConcurso = (id: string) => {
    setSelectedConcursoId(id);
    setViewState(ViewState.CONCURSO_DETAIL);
  };

  const handleBack = () => {
    // Update ViewState based on where we are coming from
    if (viewState === ViewState.CONCURSO_DETAIL) {
      setViewState(ViewState.CONCURSOS);
    } else if (viewState === ViewState.SUBJECT_DETAIL) {
      setViewState(ViewState.SUBJECTS);
    }
    // For REVIEW, renderReview handles the 'list' vs 'detail' internally based on ID,
    // but clearing the ID below handles it.

    setSelectedSubjectId(null);
    setSelectedConcursoId(null);
  };

  const handleGenerateFlashcards = async () => {
    const subject = subjects.find(s => s.id === selectedSubjectId);
    if (!subject || subject.files.length === 0) {
      alert("Esta matéria não possui arquivos para gerar flashcards.");
      return;
    }

    setIsGeneratingCards(true);
    try {
      const validFiles = subject.files.filter(f => f.data && f.data.length > 0);
      const generatedCards = await generateFlashcards(validFiles, apiKeyInput);
      
      handleUpdateSubject(prev => ({
        ...prev,
        flashcards: generatedCards
      }));
    } catch (error: any) {
      console.error("Erro ao gerar flashcards:", error);
      if (error.message && error.message.includes("API Key")) {
        setShowSettingsModal(true);
      } else {
        alert("Falha ao gerar flashcards com IA. " + error.message);
      }
    } finally {
      setIsGeneratingCards(false);
    }
  };

  const handleAnalyzeEdict = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !newConcursoName.trim()) {
      alert("Por favor, insira um nome para o concurso.");
      return;
    }

    if (file.type !== 'application/pdf') {
       alert("Apenas arquivos PDF são permitidos.");
       return;
    }

    setIsAnalyzingEdict(true);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
       const base64 = event.target?.result as string;
       const storedFile: StoredFile = {
         id: crypto.randomUUID(),
         name: file.name,
         mimeType: file.type,
         data: base64
       };

       try {
         const analysis = await analyzeEdict(storedFile, apiKeyInput);
         
         const newConcurso: Concurso = {
           id: crypto.randomUUID(),
           name: newConcursoName,
           file: storedFile,
           analysis: analysis,
           messages: [],
           createdAt: Date.now()
         };

         setConcursos([newConcurso, ...concursos]);
         setNewConcursoName('');
         setShowConcursoModal(false);
       } catch (error: any) {
         console.error("Erro ao analisar edital", error);
         if (error.message && error.message.includes("API Key")) {
           setShowSettingsModal(true);
         } else {
           alert("Falha ao analisar o edital: " + error.message);
         }
       } finally {
         setIsAnalyzingEdict(false);
       }
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  const handleDeleteConcurso = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const concurso = concursos.find(c => c.id === id);
    if (concurso) {
      deleteFileFromDB(concurso.file.id);
    }
    setConcursos(concursos.filter(c => c.id !== id));
    if (selectedConcursoId === id) {
      setSelectedConcursoId(null);
    }
  };

  const handleNextCard = () => {
    setIsCardFlipped(false);
    setTimeout(() => {
        setActiveFlashcardIndex(prev => prev + 1);
    }, 150);
  };

  const handlePrevCard = () => {
    setIsCardFlipped(false);
    setTimeout(() => {
        setActiveFlashcardIndex(prev => Math.max(0, prev - 1));
    }, 150);
  };

  const handleUpdateSubject = (updatedSubjectOrFn: Subject | ((prev: Subject) => Subject), deletedFileIds?: string[]) => {
    setSubjects(prevSubjects => {
      return prevSubjects.map(s => {
        if (s.id === selectedSubjectId) {
          const newState = typeof updatedSubjectOrFn === 'function' 
            ? updatedSubjectOrFn(s) 
            : updatedSubjectOrFn;

          return newState;
        }
        return s;
      });
    });

    if (deletedFileIds && deletedFileIds.length > 0) {
      deletedFileIds.forEach(id => {
        deleteFileFromDB(id).catch(console.error);
      });
    }
  };

  // This function acts as an adapter to allow ChatView to work with Concursos
  const handleUpdateConcurso = (updatedSubjectOrFn: Subject | ((prev: Subject) => Subject), deletedFileIds?: string[]) => {
    setConcursos(prevConcursos => {
      return prevConcursos.map(c => {
        if (c.id === selectedConcursoId) {
          // Create a proxy Subject from the current Concurso state
          const proxySubject: Subject = {
            id: c.id,
            name: c.name,
            description: "Concurso Proxy",
            files: [c.file],
            messages: c.messages || [],
            notes: c.analysis,
            flashcards: [],
            createdAt: c.createdAt
          };

          // Apply the update function intended for a Subject to our Proxy
          const newStateSubject = typeof updatedSubjectOrFn === 'function'
            ? updatedSubjectOrFn(proxySubject)
            : updatedSubjectOrFn;

          // Map the updated fields back to Concurso structure
          // Note: We assume file uploads aren't allowed/needed in Concurso Chat for now, or we'd need to handle array -> single file
          return {
            ...c,
            messages: newStateSubject.messages,
            analysis: newStateSubject.notes,
            // If we allowed adding files in chat, we would handle it here, but for now we keep the original file
          };
        }
        return c;
      });
    });
  };

  const activeSubject = subjects.find(s => s.id === selectedSubjectId);
  const activeConcurso = concursos.find(c => c.id === selectedConcursoId);

  // --- Login Check ---
  if (!currentUser) {
    return <LoginView onLogin={handleLogin} />;
  }

  // --- Views ---

  const renderDashboard = () => (
    <div className="p-6 md:p-10 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-700">
      <div className="max-w-5xl mx-auto space-y-8">
        <header>
          <h2 className="text-3xl font-bold text-white mb-2 drop-shadow-sm">Olá, {currentUser.name.split(' ')[0]}</h2>
          <p className="text-slate-300">Aqui está o resumo do seu progresso.</p>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-surface/80 backdrop-blur-md border border-slate-700/50 p-6 rounded-2xl shadow-lg hover:bg-surface/90 transition-colors">
            <div className="flex items-center gap-4 mb-2">
              <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
                <TimerIcon className="w-6 h-6" />
              </div>
              <span className="text-slate-400 text-sm font-medium">Tempo Total</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {Math.floor(stats.totalMinutes / 60)}h {stats.totalMinutes % 60}m
            </div>
            <div className="text-xs text-slate-500 mt-2">Dedicados aos estudos</div>
          </div>

          <div className="bg-surface/80 backdrop-blur-md border border-slate-700/50 p-6 rounded-2xl shadow-lg hover:bg-surface/90 transition-colors">
            <div className="flex items-center gap-4 mb-2">
              <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-400">
                <BookIcon className="w-6 h-6" />
              </div>
              <span className="text-slate-400 text-sm font-medium">Matérias</span>
            </div>
            <div className="text-3xl font-bold text-white">{subjects.length}</div>
            <div className="text-xs text-slate-500 mt-2">Matérias ativas</div>
          </div>

          <div className="bg-surface/80 backdrop-blur-md border border-slate-700/50 p-6 rounded-2xl shadow-lg hover:bg-surface/90 transition-colors">
            <div className="flex items-center gap-4 mb-2">
              <div className="p-3 bg-orange-500/20 rounded-xl text-orange-400">
                <LayoutDashboardIcon className="w-6 h-6" />
              </div>
              <span className="text-slate-400 text-sm font-medium">Ciclos Focados</span>
            </div>
            <div className="text-3xl font-bold text-white">{stats.sessionsCompleted}</div>
            <div className="text-xs text-slate-500 mt-2">Pomodoros concluídos</div>
          </div>
        </div>

        {/* Pomodoro Section */}
        <div className="bg-surface/70 backdrop-blur-md border border-slate-700/50 rounded-3xl p-8 md:p-12 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl"></div>
          
          <div className="flex flex-col items-center justify-center relative z-10">
            <div className="flex items-center gap-2 mb-6">
              <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase ${!isBreakMode ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-500'}`}>Foco</span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase ${isBreakMode ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-500'}`}>Pausa</span>
            </div>

            <div className="text-8xl md:text-9xl font-bold text-white tabular-nums tracking-tight mb-8 drop-shadow-2xl">
              {formatTime(timerSeconds)}
            </div>

            <div className="flex items-center gap-4">
              <button 
                onClick={toggleTimer}
                className={`
                  flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg transition-all shadow-lg hover:-translate-y-1
                  ${isTimerActive 
                    ? 'bg-slate-700/80 text-slate-200 hover:bg-slate-600' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-500 hover:shadow-indigo-500/25'}
                `}
              >
                {isTimerActive ? (
                  <>
                    <PauseIcon className="w-5 h-5" /> Pausar
                  </>
                ) : (
                  <>
                    <PlayIcon className="w-5 h-5" /> Iniciar
                  </>
                )}
              </button>

              <button 
                onClick={resetTimer}
                className="p-4 rounded-2xl bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition-all border border-slate-700/50"
                title="Reiniciar Timer"
              >
                <RotateCcwIcon className="w-5 h-5" />
              </button>
            </div>
            
            <p className="mt-8 text-slate-400 text-sm max-w-md text-center">
              {isBreakMode 
                ? "Aproveite para esticar as pernas e beber água." 
                : "Concentre-se em uma única tarefa até o timer tocar. Você consegue!"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSubjects = () => {
    const filteredSubjects = subjects.filter(subject => 
      subject.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      subject.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <div className="flex-1 overflow-y-auto p-6 md:p-10 scrollbar-thin scrollbar-thumb-slate-700">
        <div className="max-w-6xl mx-auto">
          <header className="mb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 drop-shadow-sm">Minhas Matérias</h2>
              <p className="text-slate-300">Gerencie seus PDFs e chats.</p>
            </div>
            <button 
              onClick={() => setShowModal(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white py-2 px-4 rounded-xl transition-all font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20 w-full md:w-auto"
            >
              <PlusIcon className="w-4 h-4" />
              Nova Matéria
            </button>
          </header>

          {/* Search Bar */}
          {subjects.length > 0 && (
            <div className="relative mb-8">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <SearchIcon className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar matérias..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-2.5 border border-slate-700/50 rounded-xl leading-5 bg-surface/50 backdrop-blur-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all shadow-sm"
              />
            </div>
          )}
          
          {isLoadingFiles ? (
            <div className="flex justify-center py-10 text-slate-400">
               <p>Carregando arquivos...</p>
            </div>
          ) : subjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-slate-400 border border-dashed border-slate-700/50 rounded-2xl bg-surface/30 backdrop-blur-sm p-8">
              <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-4 shadow-inner">
                <BookIcon className="w-8 h-8 text-slate-500" />
              </div>
              <h3 className="text-lg font-medium text-slate-200 mb-2">Nenhuma matéria encontrada</h3>
              <p className="max-w-xs text-center mb-6 text-sm">Crie sua primeira matéria para começar a estudar.</p>
              <button 
                onClick={() => setShowModal(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 px-6 rounded-xl transition-all font-medium shadow-lg shadow-indigo-900/20"
              >
                Criar Nova Matéria
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <button 
                onClick={() => setShowModal(true)}
                className="md:hidden group h-48 border border-dashed border-slate-700/70 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-indigo-400 hover:border-indigo-500/50 hover:bg-slate-800/30 backdrop-blur-sm transition-all cursor-pointer"
              >
                <div className="w-12 h-12 rounded-full bg-slate-800/50 group-hover:bg-indigo-500/10 flex items-center justify-center mb-3 transition-colors">
                  <PlusIcon className="w-6 h-6" />
                </div>
                <span className="font-medium">Adicionar Matéria</span>
              </button>
              
              {filteredSubjects.length === 0 && searchQuery && (
                 <div className="col-span-full py-12 text-center text-slate-400">
                   <p>Nenhuma matéria encontrada para "{searchQuery}".</p>
                 </div>
              )}

              {filteredSubjects.map(subject => (
                <div key={subject.id} className="backdrop-blur-sm bg-surface/60 rounded-xl">
                  <SubjectCard 
                    subject={subject} 
                    onClick={() => handleSelectSubject(subject.id)} 
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderConcursos = () => {
     return (
       <div className="flex-1 overflow-y-auto p-6 md:p-10 scrollbar-thin scrollbar-thumb-slate-700">
          <div className="max-w-6xl mx-auto">
            <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 drop-shadow-sm">Concursos</h2>
                <p className="text-slate-300">Analise editais e extraia o que realmente importa.</p>
              </div>
              <button 
                onClick={() => setShowConcursoModal(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white py-2 px-4 rounded-xl transition-all font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20 w-full md:w-auto"
              >
                <PlusIcon className="w-4 h-4" />
                Novo Edital
              </button>
            </header>

            {concursos.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-[50vh] text-slate-400 border border-dashed border-slate-700/50 rounded-2xl bg-surface/30 backdrop-blur-sm p-8">
                 <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-4 shadow-inner">
                    <BriefcaseIcon className="w-8 h-8 text-slate-500" />
                 </div>
                 <h3 className="text-lg font-medium text-slate-200 mb-2">Nenhum edital analisado</h3>
                 <p className="max-w-md text-center mb-6 text-sm">Envie o PDF de um edital e a IA irá extrair datas, vagas, salários e o conteúdo programático para você.</p>
                 <button 
                    onClick={() => setShowConcursoModal(true)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 px-6 rounded-xl transition-all font-medium shadow-lg shadow-indigo-900/20"
                 >
                    Analisar Edital
                 </button>
               </div>
            ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {concursos.map(conc => (
                    <div 
                        key={conc.id} 
                        onClick={() => handleSelectConcurso(conc.id)}
                        className="bg-surface/70 hover:bg-surface/90 backdrop-blur-md border border-slate-700/50 hover:border-indigo-500/50 rounded-2xl p-6 shadow-lg transition-all cursor-pointer group flex flex-col"
                    >
                       <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-4">
                             <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400 group-hover:bg-indigo-500/30 transition-colors">
                               <BriefcaseIcon className="w-6 h-6" />
                             </div>
                             <div>
                               <h3 className="text-xl font-bold text-white group-hover:text-indigo-300 transition-colors">{conc.name}</h3>
                               <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                                  <FileTextIcon className="w-3 h-3" /> {conc.file.name}
                               </p>
                             </div>
                          </div>
                          <button 
                            onClick={(e) => handleDeleteConcurso(conc.id, e)}
                            className="text-slate-500 hover:text-red-400 p-2 hover:bg-slate-800 rounded-lg transition-colors z-10"
                            title="Apagar análise"
                          >
                             <TrashIcon className="w-4 h-4" />
                          </button>
                       </div>
                       
                       <div className="bg-darker/50 rounded-xl p-4 text-slate-300 text-sm line-clamp-5 border border-slate-700/50 flex-grow">
                          {conc.analysis.slice(0, 300)}...
                       </div>
                       <div className="mt-4 pt-3 border-t border-slate-700/50 flex justify-between items-center">
                         <span className="text-xs text-slate-500">{new Date(conc.createdAt).toLocaleDateString('pt-BR')}</span>
                         <span className="text-xs text-indigo-400 font-medium group-hover:translate-x-1 transition-transform flex items-center gap-1">
                            Abrir Chat <ArrowLeftIcon className="w-3 h-3 rotate-180" />
                         </span>
                       </div>
                    </div>
                  ))}
               </div>
            )}
          </div>
       </div>
     );
  };

  const renderReview = () => {
    if (!selectedSubjectId) {
      return (
        <div className="flex-1 overflow-y-auto p-6 md:p-10 scrollbar-thin scrollbar-thumb-slate-700">
           <div className="max-w-4xl mx-auto">
             <header className="mb-8">
               <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 drop-shadow-sm">Área de Revisão</h2>
               <p className="text-slate-300">Selecione uma matéria para gerar e praticar Flashcards.</p>
             </header>
             
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               {subjects.map(sub => (
                 <div 
                   key={sub.id} 
                   onClick={() => handleSelectSubjectForReview(sub.id)}
                   className="bg-surface/60 hover:bg-surface/80 backdrop-blur-md border border-slate-700/50 p-4 rounded-xl cursor-pointer transition-all hover:border-indigo-500/50 flex items-center justify-between group"
                 >
                    <div className="flex items-center gap-3 overflow-hidden">
                       <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 group-hover:bg-indigo-500/20 group-hover:text-indigo-300 transition-colors">
                          <BrainIcon className="w-5 h-5" />
                       </div>
                       <div>
                         <h4 className="font-semibold text-slate-200 truncate">{sub.name}</h4>
                         <p className="text-xs text-slate-500">{sub.flashcards?.length || 0} cards disponíveis</p>
                       </div>
                    </div>
                    <div className="text-slate-500 group-hover:translate-x-1 transition-transform">
                       <ArrowLeftIcon className="w-5 h-5 rotate-180" />
                    </div>
                 </div>
               ))}
             </div>
             
             {subjects.length === 0 && (
               <div className="text-center text-slate-400 mt-12">
                 <p>Adicione matérias para habilitar a revisão.</p>
               </div>
             )}
           </div>
        </div>
      );
    }

    const subject = activeSubject;
    if (!subject) return null;
    
    const hasCards = subject.flashcards && subject.flashcards.length > 0;
    const currentCard = hasCards ? subject.flashcards![activeFlashcardIndex] : null;

    return (
      <div className="flex-1 flex flex-col p-6 md:p-10 overflow-hidden relative">
        <div className="max-w-3xl w-full mx-auto flex flex-col h-full">
           {/* Header */}
           <div className="flex items-center justify-between mb-6 shrink-0">
              <button 
                onClick={() => setSelectedSubjectId(null)}
                className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
              >
                 <ArrowLeftIcon className="w-4 h-4" /> Voltar
              </button>
              <h3 className="font-semibold text-white">{subject.name}</h3>
              <div className="w-20"></div> 
           </div>

           {/* Main Area */}
           <div className="flex-1 flex flex-col items-center justify-center relative">
             {!hasCards ? (
               <div className="text-center p-8 bg-surface/60 backdrop-blur-md border border-slate-700 rounded-2xl max-w-md">
                 <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-400">
                    <SparklesIcon className="w-8 h-8" />
                 </div>
                 <h3 className="text-xl font-bold text-white mb-2">Gerar Flashcards</h3>
                 <p className="text-slate-400 text-sm mb-6">
                   A Inteligência Artificial analisará seus PDFs e criará perguntas para você praticar.
                 </p>
                 <button
                   onClick={handleGenerateFlashcards}
                   disabled={isGeneratingCards || subject.files.length === 0}
                   className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-xl font-medium transition-all shadow-lg flex items-center justify-center gap-2"
                 >
                   {isGeneratingCards ? (
                     <>
                        <LoaderIcon className="w-5 h-5" /> Criando...
                     </>
                   ) : (
                     <>
                        <BrainIcon className="w-5 h-5" /> Gerar com IA
                     </>
                   )}
                 </button>
                 {subject.files.length === 0 && (
                   <p className="text-xs text-red-400 mt-3">Necessário enviar PDFs no chat primeiro.</p>
                 )}
               </div>
             ) : (
               <div className="w-full max-w-lg perspective-1000 h-[400px] relative group">
                 <div 
                   className={`relative w-full h-full transition-all duration-500 transform-style-3d cursor-pointer ${isCardFlipped ? 'rotate-y-180' : ''}`}
                   onClick={() => setIsCardFlipped(!isCardFlipped)}
                 >
                    {/* Front */}
                    <div className="absolute inset-0 backface-hidden bg-surface/80 backdrop-blur-xl border border-slate-700 rounded-3xl shadow-2xl p-8 flex flex-col items-center justify-center text-center hover:border-indigo-500/50 transition-colors">
                       <span className="absolute top-6 left-6 text-xs font-bold tracking-widest text-indigo-400 uppercase">Pergunta</span>
                       <p className="text-xl md:text-2xl font-medium text-white leading-relaxed">
                         {currentCard?.question}
                       </p>
                       <div className="absolute bottom-6 text-slate-500 text-sm flex items-center gap-2">
                          <RefreshCwIcon className="w-4 h-4" /> Toque para ver a resposta
                       </div>
                    </div>

                    {/* Back */}
                    <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-900/80 backdrop-blur-xl border border-indigo-500/30 rounded-3xl shadow-2xl p-8 flex flex-col items-center justify-center text-center">
                       <span className="absolute top-6 left-6 text-xs font-bold tracking-widest text-indigo-200 uppercase">Resposta</span>
                       <p className="text-lg md:text-xl text-indigo-100 leading-relaxed">
                         {currentCard?.answer}
                       </p>
                    </div>
                 </div>
               </div>
             )}
           </div>

           {/* Controls */}
           {hasCards && (
             <div className="mt-8 flex items-center justify-between max-w-sm mx-auto w-full shrink-0">
                <button 
                  onClick={handlePrevCard}
                  disabled={activeFlashcardIndex === 0}
                  className="p-4 rounded-full bg-slate-800/80 text-white hover:bg-indigo-600 disabled:opacity-30 disabled:hover:bg-slate-800 transition-all"
                >
                  <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <span className="text-slate-400 font-mono text-sm">
                  {activeFlashcardIndex + 1} / {subject.flashcards!.length}
                </span>
                <button 
                  onClick={handleNextCard}
                  disabled={activeFlashcardIndex === subject.flashcards!.length - 1}
                  className="p-4 rounded-full bg-slate-800/80 text-white hover:bg-indigo-600 disabled:opacity-30 disabled:hover:bg-slate-800 transition-all"
                >
                   <ArrowLeftIcon className="w-5 h-5 rotate-180" />
                </button>
             </div>
           )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen w-screen bg-darker text-slate-200 font-sans selection:bg-indigo-500/30 relative overflow-hidden">
      
      {/* Background Image Layer */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1481627834876-b7833e8f5570?ixlib=rb-4.0.3&auto=format&fit=crop&w=2228&q=80')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.08,
          filter: 'sepia(10%) saturate(120%)'
        }}
      />
      
      {/* Storage Warning */}
      {storageError && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-red-900/90 text-red-200 text-xs px-4 py-2 text-center backdrop-blur-sm border-b border-red-700">
          {storageError}
        </div>
      )}

      {/* Sidebar (Desktop) */}
      <div className="w-64 bg-surface/80 backdrop-blur-xl border-r border-slate-800/50 flex-col hidden md:flex z-20 relative">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800/50">
          <img src={LOGO_URL} alt="Logo" className="w-8 h-8 drop-shadow-md" />
          <h1 className="font-bold text-lg tracking-tight text-white">ESTUDE MAIS</h1>
        </div>

        {/* User Profile in Sidebar */}
        <div className="px-4 pt-6 pb-2">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <img 
              src={currentUser.avatar} 
              alt="User" 
              className="w-10 h-10 rounded-full border border-indigo-500/30"
            />
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-semibold text-white truncate">{currentUser.name}</p>
              <p className="text-xs text-slate-400 truncate">{currentUser.email}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setViewState(ViewState.DASHBOARD)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              viewState === ViewState.DASHBOARD
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <LayoutDashboardIcon className="w-5 h-5" />
            Dashboard
          </button>

          <button
            onClick={() => setViewState(ViewState.SUBJECTS)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              viewState === ViewState.SUBJECTS || viewState === ViewState.SUBJECT_DETAIL
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <BookIcon className="w-5 h-5" />
            Matérias
          </button>

          <button
            onClick={() => setViewState(ViewState.REVIEW)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              viewState === ViewState.REVIEW
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <ClipboardCheckIcon className="w-5 h-5" />
            Revisão
          </button>

          <button
            onClick={() => setViewState(ViewState.CONCURSOS)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              viewState === ViewState.CONCURSOS || viewState === ViewState.CONCURSO_DETAIL
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <BriefcaseIcon className="w-5 h-5" />
            Concursos
          </button>
        </nav>

        {/* Mini Timer in Sidebar */}
        {isTimerActive && viewState !== ViewState.DASHBOARD && (
          <div className="px-4 pb-2">
            <div className="p-4 bg-slate-800/80 backdrop-blur-sm rounded-xl border border-slate-700/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">{isBreakMode ? 'Pausa' : 'Foco'}</span>
                <TimerIcon className="w-4 h-4 text-slate-500" />
              </div>
              <div className="text-2xl font-bold text-white text-center font-mono">
                {formatTime(timerSeconds)}
              </div>
            </div>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="p-4 mt-auto space-y-2 border-t border-slate-800/50">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800/50 hover:text-white transition-all"
          >
            <SettingsIcon className="w-4 h-4" />
            Configurações
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-all"
          >
            <LogOutIcon className="w-4 h-4" />
            Sair
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-transparent z-10">
        {/* Mobile Header */}
        <div className="md:hidden h-16 border-b border-slate-800/50 bg-surface/80 backdrop-blur-md flex items-center justify-between px-4 z-30 shrink-0">
           <div className="flex items-center gap-3">
             <img src={LOGO_URL} alt="Logo" className="w-8 h-8 drop-shadow-md" />
             <h1 className="font-bold text-white tracking-tight">ESTUDE MAIS</h1>
             {isTimerActive && (
                <div className="ml-2 px-2 py-0.5 bg-slate-800/80 rounded border border-slate-700 flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${isBreakMode ? 'bg-emerald-400' : 'bg-indigo-400'} animate-pulse`}></div>
                  <span className="text-xs font-mono text-slate-300">{formatTime(timerSeconds)}</span>
                </div>
             )}
           </div>
           <div className="flex gap-2">
             <button 
               onClick={() => setShowSettingsModal(true)}
               className="p-2 rounded-lg text-slate-400"
             >
               <SettingsIcon className="w-5 h-5" />
             </button>
             <button 
               onClick={handleLogout}
               className="p-2 rounded-lg text-slate-400 hover:text-red-400"
             >
               <LogOutIcon className="w-5 h-5" />
             </button>
           </div>
        </div>
        
        {/* Mobile Nav Bar (Bottom) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-xl border-t border-slate-800/50 z-40 flex justify-around p-3">
             <button 
               onClick={() => setViewState(ViewState.DASHBOARD)}
               className={`flex flex-col items-center gap-1 ${viewState === ViewState.DASHBOARD ? 'text-indigo-400' : 'text-slate-500'}`}
             >
               <LayoutDashboardIcon className="w-5 h-5" />
               <span className="text-[10px]">Início</span>
             </button>
             <button 
               onClick={() => setViewState(ViewState.SUBJECTS)}
               className={`flex flex-col items-center gap-1 ${viewState === ViewState.SUBJECTS || viewState === ViewState.SUBJECT_DETAIL ? 'text-indigo-400' : 'text-slate-500'}`}
             >
               <BookIcon className="w-5 h-5" />
               <span className="text-[10px]">Matérias</span>
             </button>
             <button 
               onClick={() => setViewState(ViewState.REVIEW)}
               className={`flex flex-col items-center gap-1 ${viewState === ViewState.REVIEW ? 'text-indigo-400' : 'text-slate-500'}`}
             >
               <ClipboardCheckIcon className="w-5 h-5" />
               <span className="text-[10px]">Revisão</span>
             </button>
             <button 
               onClick={() => setViewState(ViewState.CONCURSOS)}
               className={`flex flex-col items-center gap-1 ${viewState === ViewState.CONCURSOS || viewState === ViewState.CONCURSO_DETAIL ? 'text-indigo-400' : 'text-slate-500'}`}
             >
               <BriefcaseIcon className="w-5 h-5" />
               <span className="text-[10px]">Concursos</span>
             </button>
        </div>

        <div className="flex-1 overflow-hidden relative md:pb-0 pb-16">
            {viewState === ViewState.DASHBOARD && renderDashboard()}
            
            {viewState === ViewState.SUBJECTS && renderSubjects()}

            {viewState === ViewState.REVIEW && renderReview()}
            
            {viewState === ViewState.CONCURSOS && renderConcursos()}

            {viewState === ViewState.SUBJECT_DETAIL && (
            <div className="flex flex-col h-full">
                <div className="md:hidden bg-surface/80 backdrop-blur-md border-b border-slate-800/50 px-2 py-2 flex items-center shrink-0">
                    <button 
                    onClick={handleBack} 
                    className="flex items-center gap-2 text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors text-sm font-medium"
                    >
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                    </button>
                </div>
                {activeSubject && (
                <ChatView 
                    subject={activeSubject} 
                    onUpdateSubject={handleUpdateSubject}
                    apiKey={apiKeyInput}
                />
                )}
            </div>
            )}

            {viewState === ViewState.CONCURSO_DETAIL && (
            <div className="flex flex-col h-full">
                <div className="bg-surface/80 backdrop-blur-md border-b border-slate-800/50 px-2 py-2 flex items-center shrink-0 z-20 md:hidden">
                    <button 
                    onClick={handleBack} 
                    className="flex items-center gap-2 text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors text-sm font-medium"
                    >
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                    </button>
                </div>
                
                {/* Desktop Back Button */}
                <div className="hidden md:block absolute top-4 left-6 z-30">
                    <button 
                    onClick={handleBack} 
                    className="flex items-center gap-2 text-slate-400 hover:text-white px-3 py-2 rounded-lg bg-surface/50 backdrop-blur hover:bg-slate-800/80 transition-colors text-sm font-medium border border-slate-700/50"
                    >
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar aos Editais</span>
                    </button>
                </div>

                {activeConcurso && (
                <div className="h-full pt-0 md:pt-0">
                    <ChatView 
                        // We map the Concurso to a Subject structure for the ChatView component
                        subject={{
                            id: activeConcurso.id,
                            name: activeConcurso.name,
                            description: "Edital",
                            files: [activeConcurso.file],
                            messages: activeConcurso.messages,
                            notes: activeConcurso.analysis, // The edict analysis is treated as notes
                            createdAt: activeConcurso.createdAt
                        }}
                        onUpdateSubject={handleUpdateConcurso}
                        apiKey={apiKeyInput}
                        notesLabel="Análise do Edital"
                        inputPlaceholder="Tire dúvidas sobre datas, vagas ou conteúdo..."
                    />
                </div>
                )}
            </div>
            )}
        </div>

        {/* New Subject Modal */}
        {showModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-surface border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Nova Matéria</h3>
                <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white transition-colors">
                  <XIcon className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Nome da Matéria</label>
                  <input 
                    type="text" 
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    placeholder="Ex: História do Brasil..."
                    className="w-full bg-darker border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Descrição <span className="text-slate-600 font-normal">(Opcional)</span></label>
                  <textarea 
                    value={newSubjectDesc}
                    onChange={(e) => setNewSubjectDesc(e.target.value)}
                    placeholder="Breve descrição sobre o conteúdo..."
                    className="w-full bg-darker border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all resize-none h-28"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors font-medium"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleCreateSubject}
                    disabled={!newSubjectName.trim()}
                    className="flex-1 py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
                  >
                    Criar Matéria
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* New Concurso Modal */}
        {showConcursoModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-surface border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                      <BriefcaseIcon className="w-5 h-5" />
                   </div>
                   <h3 className="text-xl font-bold text-white">Novo Edital</h3>
                </div>
                <button 
                  onClick={() => !isAnalyzingEdict && setShowConcursoModal(false)} 
                  disabled={isAnalyzingEdict}
                  className="text-slate-500 hover:text-white transition-colors disabled:opacity-50"
                >
                  <XIcon className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-5">
                <div className="p-4 bg-slate-800/50 rounded-xl text-sm text-slate-300 border border-slate-700/50">
                   Envie o PDF do edital. Nossa IA irá analisar e extrair as informações vitais automaticamente.
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Nome do Concurso</label>
                  <input 
                    type="text" 
                    value={newConcursoName}
                    onChange={(e) => setNewConcursoName(e.target.value)}
                    placeholder="Ex: Polícia Federal 2025"
                    disabled={isAnalyzingEdict}
                    className="w-full bg-darker border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all disabled:opacity-50"
                  />
                </div>
                
                <div>
                   <label className="block text-sm font-medium text-slate-400 mb-1.5">Arquivo do Edital (PDF)</label>
                   <button
                      onClick={() => edictInputRef.current?.click()}
                      disabled={isAnalyzingEdict}
                      className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-slate-700 rounded-xl hover:bg-slate-800/50 hover:border-indigo-500/50 transition-all text-slate-400 hover:text-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                      {isAnalyzingEdict ? (
                         <>
                            <LoaderIcon className="w-5 h-5" /> Analisando...
                         </>
                      ) : (
                         <>
                            <UploadIcon className="w-5 h-5" /> Selecionar PDF
                         </>
                      )}
                   </button>
                   <input 
                      type="file" 
                      accept="application/pdf"
                      ref={edictInputRef}
                      className="hidden"
                      onChange={handleAnalyzeEdict}
                   />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* API Key Settings Modal */}
        {showSettingsModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-surface border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                    <KeyIcon className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Configurar API</h3>
                </div>
                <button onClick={() => setShowSettingsModal(false)} className="text-slate-500 hover:text-white transition-colors">
                  <XIcon className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-5">
                <div className="p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-xl text-sm text-indigo-200">
                  <p className="mb-2 font-medium">Por que preciso disso?</p>
                  <p className="opacity-80">
                    Para usar a Inteligência Artificial do Google Gemini, você precisa de uma chave de acesso gratuita. 
                    Sua chave será salva apenas neste navegador.
                  </p>
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="inline-block mt-3 text-indigo-400 underline hover:text-indigo-300">
                    Obter chave gratuita aqui &rarr;
                  </a>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Gemini API Key</label>
                  <input 
                    type="text" // Should be password, but for API keys sometimes visibility helps checking errors. 
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Cole sua chave aqui (começa com AIza...)"
                    className="w-full bg-darker border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all font-mono text-sm"
                  />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowSettingsModal(false)}
                    className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors font-medium"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleSaveApiKey}
                    className="flex-1 py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    <SaveIcon className="w-4 h-4" />
                    Salvar Chave
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;