import React from 'react';
import { Subject } from '../types';
import { BookIcon, FileTextIcon } from './Icons';

interface SubjectCardProps {
  subject: Subject;
  onClick: () => void;
}

const SubjectCard: React.FC<SubjectCardProps> = ({ subject, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className="group bg-surface hover:bg-slate-700 border border-slate-700 hover:border-indigo-500 transition-all duration-200 p-5 rounded-xl cursor-pointer flex flex-col h-48 relative overflow-hidden hover:scale-[1.02] hover:shadow-xl hover:shadow-indigo-500/10"
    >
      <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl group-hover:bg-indigo-500/20 transition-all"></div>
      
      <div className="flex items-center gap-3 mb-3 z-10">
        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400 group-hover:text-indigo-300">
          <BookIcon className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-semibold text-white truncate">{subject.name}</h3>
      </div>
      
      <p className="text-slate-400 text-sm line-clamp-2 flex-grow z-10 mb-4">
        {subject.description || "Sem descrição."}
      </p>
      
      <div className="flex items-center text-xs text-slate-500 gap-4 z-10 mt-auto">
        <div className="flex items-center gap-1">
          <FileTextIcon className="w-4 h-4" />
          <span>{subject.files.length} Arquivos</span>
        </div>
        <div className="flex items-center gap-1">
          <span>{new Date(subject.createdAt).toLocaleDateString('pt-BR')}</span>
        </div>
      </div>
    </div>
  );
};

export default SubjectCard;