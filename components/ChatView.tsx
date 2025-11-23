
import React, { useState, useRef, useEffect } from 'react';
import { Subject, StoredFile, Message } from '../types';
import { streamAnalysisResponse } from '../services/geminiService';
import { 
  SendIcon, 
  UploadIcon, 
  FileTextIcon, 
  TrashIcon, 
  LoaderIcon, 
  EyeIcon, 
  XIcon, 
  PenLineIcon, 
  MessageSquareIcon,
  SaveIcon,
  CheckIcon,
  PanelRightIcon
} from './Icons';

interface ChatViewProps {
  subject: Subject;
  onUpdateSubject: (updatedSubjectOrFn: Subject | ((prev: Subject) => Subject), deletedFileIds?: string[]) => void;
  apiKey?: string;
  notesLabel?: string;
  inputPlaceholder?: string;
}

type Tab = 'chat' | 'notes';

const ChatView: React.FC<ChatViewProps> = ({ 
  subject, 
  onUpdateSubject, 
  apiKey,
  notesLabel = "Anotações",
  inputPlaceholder = "Pergunte sobre seus documentos..."
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [viewingFile, setViewingFile] = useState<StoredFile | null>(null);
  const [showFileNotes, setShowFileNotes] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimeoutRef = useRef<number | null>(null);
  const fileNoteTimeoutRef = useRef<number | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [subject.messages, activeTab]);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      if (fileNoteTimeoutRef.current) {
        clearTimeout(fileNoteTimeoutRef.current);
      }
    };
  }, []);

  // Handle PDF Blob URL creation/cleanup
  useEffect(() => {
    if (viewingFile && viewingFile.data) {
      try {
        // Convert Base64 to Blob
        const byteCharacters = atob(viewingFile.data.split(',')[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);

        return () => {
          URL.revokeObjectURL(url);
          setPdfUrl(null);
        };
      } catch (e) {
        console.error("Erro ao gerar visualização do PDF", e);
        alert("Erro ao abrir o PDF. O arquivo pode estar corrompido ou incompleto.");
        setViewingFile(null);
      }
    } else if (viewingFile && !viewingFile.data) {
      alert("Conteúdo do arquivo não encontrado. Tente recarregar a página.");
      setViewingFile(null);
    }
  }, [viewingFile?.data]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Por favor, envie apenas arquivos PDF.');
      return;
    }

    // Size warning for very large files
    if (file.size > 10 * 1024 * 1024) {
      const confirm = window.confirm('Este arquivo é grande (>10MB) e pode demorar para ser processado pela IA. Deseja continuar?');
      if (!confirm) {
        e.target.value = '';
        return;
      }
    }

    setIsProcessingFile(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const newFile: StoredFile = {
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: file.type,
        data: base64,
        notes: '',
      };

      // Functional update ensures we don't overwrite messages if streaming
      onUpdateSubject((prev) => ({
        ...prev,
        files: [...prev.files, newFile],
      }));
      setIsProcessingFile(false);
    };
    
    reader.onerror = () => {
      alert('Erro ao ler o arquivo.');
      setIsProcessingFile(false);
    };

    reader.readAsDataURL(file);
    // Reset input
    e.target.value = '';
  };

  const handleRemoveFile = (fileId: string) => {
    // Use functional update to be safe against race conditions
    onUpdateSubject((prev) => ({
      ...prev,
      files: prev.files.filter(f => f.id !== fileId),
    }), [fileId]); // Pass fileId to trigger cleanup in App

    if (viewingFile?.id === fileId) {
      setViewingFile(null);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: input,
      timestamp: Date.now(),
    };

    // Placeholder for model response
    const modelMsgId = crypto.randomUUID();
    const modelMsgPlaceholder: Message = {
      id: modelMsgId,
      role: 'model',
      text: '', // Start empty
      timestamp: Date.now(),
    };

    // 1. Update state with user message + placeholder using functional update
    onUpdateSubject((prev) => ({
        ...prev,
        messages: [...prev.messages, userMsg, modelMsgPlaceholder]
    }));

    setInput('');
    setIsStreaming(true);

    try {
      let accumulatedText = "";
      
      // Get current files for the request (snapshot at start of request)
      const validFiles = subject.files.filter(f => f.data && f.data.length > 0);
      
      await streamAnalysisResponse(
        userMsg.text,
        validFiles,
        subject.messages, // Pass current history 
        (chunk) => {
          accumulatedText += chunk;
          // Functional update to safely append text to the specific message in state
          onUpdateSubject((prevSubject) => {
             const msgs = [...prevSubject.messages];
             const lastMsgIndex = msgs.findIndex(m => m.id === modelMsgId);
             if (lastMsgIndex !== -1) {
               msgs[lastMsgIndex] = { ...msgs[lastMsgIndex], text: accumulatedText };
             } else {
                return prevSubject;
             }
             return { ...prevSubject, messages: msgs };
          });
        },
        apiKey
      );
    } catch (error) {
      console.error(error);
      onUpdateSubject((prevSubject) => {
        const msgs = [...prevSubject.messages];
        const lastMsgIndex = msgs.findIndex(m => m.id === modelMsgId);
        if (lastMsgIndex !== -1) {
           msgs[lastMsgIndex] = { 
             ...msgs[lastMsgIndex], 
             text: "Erro: Não foi possível analisar no momento. Verifique sua conexão ou tente novamente.",
             isError: true
           };
        }
        return { ...prevSubject, messages: msgs };
     });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    
    // Update parent state immediately
    onUpdateSubject(prev => ({
      ...prev,
      notes: val
    }));

    // Trigger Visual Saving State
    setSaveStatus('saving');

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Debounce the "Saved" status
    autoSaveTimeoutRef.current = window.setTimeout(() => {
      setSaveStatus('saved');
      // Revert to idle after a short delay
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 1000);
  };

  const handleFileNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!viewingFile) return;
    const val = e.target.value;

    // Update local viewing state immediately
    setViewingFile(prev => prev ? ({...prev, notes: val}) : null);

    // Debounce update to global subject state
    if (fileNoteTimeoutRef.current) {
      clearTimeout(fileNoteTimeoutRef.current);
    }

    fileNoteTimeoutRef.current = window.setTimeout(() => {
      onUpdateSubject(prev => ({
        ...prev,
        files: prev.files.map(f => f.id === viewingFile.id ? { ...f, notes: val } : f)
      }));
    }, 500);
  };

  const handleManualSave = () => {
    setSaveStatus('saving');
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    }, 600);
  };

  return (
    <div className="flex flex-col h-full bg-transparent relative">
      {/* Header */}
      <div className="p-4 border-b border-slate-800/50 bg-surface/80 backdrop-blur-md flex flex-col gap-4 sticky top-0 z-20 shadow-sm">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-white truncate max-w-[40%] drop-shadow-sm">{subject.name}</h2>
          
          {/* Tabs Switcher */}
          <div className="flex bg-slate-800/80 rounded-lg p-1 gap-1 backdrop-blur-sm">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'chat' 
                  ? 'bg-indigo-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <MessageSquareIcon className="w-3.5 h-3.5" />
              Chat
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'notes' 
                  ? 'bg-indigo-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <PenLineIcon className="w-3.5 h-3.5" />
              {notesLabel}
            </button>
          </div>

          {/* Upload Button */}
          <div className={activeTab === 'chat' ? 'block' : 'invisible'}>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingFile}
              className="flex items-center gap-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-400 text-white px-3 py-2 rounded-lg transition-colors shadow-md shadow-indigo-900/20"
            >
              {isProcessingFile ? (
                <>
                  <LoaderIcon className="w-4 h-4" />
                  Processando
                </>
              ) : (
                <>
                  <UploadIcon className="w-4 h-4" />
                  Add PDF
                </>
              )}
            </button>
            <input 
              type="file" 
              accept="application/pdf" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileUpload}
            />
          </div>
        </div>
        
        {/* File Chips */}
        {activeTab === 'chat' && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {subject.files.length === 0 && (
              <span className="text-xs text-slate-500 italic">Nenhum arquivo enviado.</span>
            )}
            {subject.files.map(file => (
              <div 
                key={file.id} 
                className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 pl-3 pr-2 py-1.5 rounded-full min-w-max group animate-in fade-in zoom-in duration-200 hover:border-indigo-500/50 transition-colors shadow-sm"
              >
                <button 
                  onClick={() => setViewingFile(file)}
                  className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity"
                  title="Clique para visualizar"
                >
                  <FileTextIcon className="w-3 h-3 text-indigo-400" />
                  <span className="text-xs text-slate-300 max-w-[150px] truncate">{file.name}</span>
                  <EyeIcon className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
                
                <div className="w-px h-3 bg-slate-600 mx-1"></div>

                <button 
                  onClick={(e) => { e.stopPropagation(); handleRemoveFile(file.id); }}
                  className="text-slate-500 hover:text-red-400 p-0.5 rounded-full hover:bg-slate-700/50 transition-colors"
                  title="Remover arquivo"
                >
                  <TrashIcon className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- Content Area --- */}
      
      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <>
          <div className="flex-grow overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700/50 scrollbar-track-transparent">
            {subject.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500/70">
                <FileTextIcon className="w-16 h-16 mb-4 stroke-1 opacity-50" />
                <p className="bg-slate-900/30 px-4 py-2 rounded-lg backdrop-blur-sm">Envie um PDF e faça perguntas para começar.</p>
              </div>
            ) : (
              subject.messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`
                      max-w-[85%] md:max-w-[70%] rounded-2xl p-4 text-sm leading-relaxed whitespace-pre-wrap shadow-md backdrop-blur-sm
                      ${msg.role === 'user' 
                        ? 'bg-indigo-600/90 text-white rounded-tr-none' 
                        : 'bg-slate-800/80 text-slate-200 rounded-tl-none border border-slate-700/50'}
                      ${msg.isError ? 'border-red-500 bg-red-900/40 text-red-200' : ''}
                    `}
                  >
                    {msg.text}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-surface/30 backdrop-blur-md border-t border-slate-800/50">
            <div className="relative bg-slate-800/80 rounded-xl border border-slate-700/50 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all shadow-lg">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={inputPlaceholder}
                className="w-full bg-transparent text-white placeholder-slate-500 px-4 py-3 pr-12 rounded-xl resize-none focus:outline-none text-sm max-h-32"
                rows={1}
                style={{ height: 'auto', minHeight: '50px' }}
              />
              <button 
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className="absolute right-2 bottom-2 p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
              >
                {isStreaming ? <LoaderIcon className="w-4 h-4" /> : <SendIcon className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-center text-[10px] text-slate-400 mt-2 drop-shadow-sm">
              A IA pode cometer erros. Verifique informações importantes.
            </p>
          </div>
        </>
      )}

      {/* Notes Tab */}
      {activeTab === 'notes' && (
        <div className="flex-grow flex flex-col p-4 md:p-6">
           <div className="flex-grow relative bg-slate-800/60 backdrop-blur-md rounded-2xl border border-slate-700/50 overflow-hidden flex flex-col shadow-xl">
             <div className="p-3 bg-slate-800/50 border-b border-slate-700/50 flex items-center justify-between text-slate-400 text-sm select-none">
               <div className="flex items-center gap-2">
                  <PenLineIcon className="w-4 h-4" />
                  <span>{notesLabel}</span>
               </div>
               <button 
                onClick={handleManualSave}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                  ${saveStatus === 'saved' 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-500'}
                `}
               >
                 {saveStatus === 'saving' ? (
                   <LoaderIcon className="w-3.5 h-3.5" />
                 ) : saveStatus === 'saved' ? (
                   <CheckIcon className="w-3.5 h-3.5" />
                 ) : (
                   <SaveIcon className="w-3.5 h-3.5" />
                 )}
                 <span>
                   {saveStatus === 'saving' ? 'Salvando...' : saveStatus === 'saved' ? 'Salvo!' : 'Salvar'}
                 </span>
               </button>
             </div>
             <textarea
               value={subject.notes || ''}
               onChange={handleNotesChange}
               placeholder="Escreva suas anotações importantes aqui..."
               className="flex-grow w-full bg-transparent p-6 text-slate-200 placeholder-slate-500/50 focus:outline-none resize-none leading-relaxed scrollbar-thin scrollbar-thumb-slate-600/50"
             />
           </div>
           <p className="text-center text-[10px] text-slate-400 mt-2 drop-shadow-sm">
              O salvamento automático também está ativo.
           </p>
        </div>
      )}

      {/* PDF Viewer Modal */}
      {viewingFile && (
        <div className="fixed inset-0 z-50 flex flex-col bg-darker/95 backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-surface shadow-lg">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                <FileTextIcon className="w-5 h-5" />
              </div>
              <h3 className="text-white font-medium truncate">{viewingFile.name}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFileNotes(!showFileNotes)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${showFileNotes ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
              >
                <PanelRightIcon className="w-5 h-5" />
                <span className="hidden sm:inline">Anotações do Arquivo</span>
              </button>
              <div className="w-px h-6 bg-slate-700 mx-2"></div>
              <button 
                onClick={() => setViewingFile(null)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                <XIcon className="w-6 h-6" />
              </button>
            </div>
          </div>
          
          <div className="flex-1 w-full h-full flex overflow-hidden">
            {/* PDF Area */}
            <div className={`flex-1 bg-slate-900 relative flex items-center justify-center p-2 transition-all duration-300 ${showFileNotes ? 'w-2/3' : 'w-full'}`}>
              {pdfUrl ? (
                <object
                  data={pdfUrl}
                  type="application/pdf"
                  className="w-full h-full rounded-lg border border-slate-700 shadow-2xl"
                  aria-label={viewingFile.name}
                >
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 text-center">
                    <p className="mb-4">Este navegador não suporta visualização direta de PDF.</p>
                    <a 
                      href={pdfUrl} 
                      download={viewingFile.name}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
                    >
                      Baixar PDF
                    </a>
                  </div>
                </object>
              ) : (
                <div className="flex flex-col items-center justify-center text-indigo-400 gap-3">
                  <LoaderIcon className="w-8 h-8" />
                  <span className="text-sm">Carregando documento...</span>
                </div>
              )}
            </div>

            {/* Side Notes Panel */}
            {showFileNotes && (
              <div className="w-96 bg-surface border-l border-slate-700 flex flex-col animate-in slide-in-from-right duration-300 shadow-2xl z-10">
                <div className="p-4 border-b border-slate-700 bg-slate-800/50">
                  <div className="flex items-center gap-2 text-slate-300 font-medium">
                    <PenLineIcon className="w-4 h-4 text-indigo-400" />
                    <span>Anotações do Arquivo</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Salvo especificamente para este PDF.</p>
                </div>
                <textarea
                  value={viewingFile.notes || ''}
                  onChange={handleFileNotesChange}
                  placeholder="Faça anotações enquanto lê..."
                  className="flex-1 bg-transparent p-4 text-slate-200 placeholder-slate-600 resize-none focus:outline-none text-sm leading-relaxed"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatView;