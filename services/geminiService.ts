
import { GoogleGenAI, Type } from "@google/genai";
import { StoredFile, Message, Flashcard } from "../types";

const MODEL_NAME = "gemini-2.5-flash";
const STORAGE_KEY_API = 'estudemais_api_key';

/**
 * Gets the GoogleGenAI client instance, prioritizing LocalStorage key then Environment key.
 */
const getGenAIClient = (passedKey?: string): GoogleGenAI => {
  const localKey = localStorage.getItem(STORAGE_KEY_API);
  // Safe access to process.env for browser environments
  let envKey = '';
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env) {
      // @ts-ignore
      envKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    } else if (typeof import.meta !== 'undefined' && import.meta.env) {
      envKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    }
  } catch (e) {
    console.warn("Could not access env vars", e);
  }

  const apiKey = passedKey || localKey || envKey;

  if (!apiKey) {
    throw new Error("API Key não configurada. Por favor, adicione sua chave nas configurações.");
  }

  return new GoogleGenAI({ apiKey });
};

/**
 * Streams a response from Gemini based on the current chat history and active files.
 */
export const streamAnalysisResponse = async (
  userMessage: string,
  files: StoredFile[],
  history: Message[],
  onChunk: (text: string) => void,
  apiKey?: string
): Promise<string> => {
  try {
    const ai = getGenAIClient(apiKey);
    const parts: any[] = [];

    // 1. Add files to the request
    files.forEach((file) => {
      const base64Data = file.data.includes(',')
        ? file.data.split(',')[1]
        : file.data;

      if (base64Data) {
        parts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: base64Data,
          },
        });
      }
    });

    // 2. Construct text prompt with context
    let contextPrompt = "";

    if (history.length > 0) {
      contextPrompt += "Histórico da conversa:\n";
      history.forEach(msg => {
        const roleLabel = msg.role === 'user' ? 'Usuário' : 'Modelo';
        contextPrompt += `${roleLabel}: ${msg.text}\n`;
      });
      contextPrompt += "\n";
    }

    contextPrompt += "Pergunta atual do usuário: " + userMessage;

    parts.push({ text: contextPrompt });

    // 3. Call the API
    const responseStream = await ai.models.generateContentStream({
      model: MODEL_NAME,
      contents: {
        parts: parts
      },
      config: {
        systemInstruction: "Você é um tutor especialista. Analise os documentos fornecidos (se houver) e responda às perguntas do usuário de forma clara, didática e concisa. Se não houver documentos, responda com base no seu conhecimento. Formatação: Use Markdown. Responda sempre em Português do Brasil.",
      }
    });

    let fullText = "";

    for await (const chunk of responseStream) {
      const text = chunk.text;
      if (text) {
        fullText += text;
        onChunk(text);
      }
    }

    return fullText;

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const msg = error.message || "Falha ao analisar documentos.";

    if (msg.includes("API Key")) {
      throw new Error("API Key inválida ou ausente. Verifique as configurações.");
    }
    throw new Error(msg);
  }
};

/**
 * Generates flashcards based on the provided files using structured JSON output.
 */
export const generateFlashcards = async (files: StoredFile[], apiKey?: string): Promise<Flashcard[]> => {
  try {
    const ai = getGenAIClient(apiKey);
    const parts: any[] = [];

    files.forEach((file) => {
      const base64Data = file.data.includes(',')
        ? file.data.split(',')[1]
        : file.data;

      if (base64Data) {
        parts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: base64Data,
          },
        });
      }
    });

    parts.push({ text: "Analise os documentos anexados e gere 10 flashcards de alta qualidade (pares de pergunta e resposta) para estudar este material. Foque em conceitos chave, definições e detalhes importantes. Responda em Português do Brasil." });

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: parts
      },
      config: {
        systemInstruction: "Você é um tutor especialista projetado para criar materiais de estudo. Retorne apenas JSON válido.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              answer: { type: Type.STRING },
            },
            required: ["question", "answer"],
          },
        },
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    return [];
  } catch (error: any) {
    console.error("Erro ao gerar flashcards:", error);
    const msg = error.message || "Falha ao gerar flashcards.";
    if (msg.includes("API Key")) {
      throw new Error("API Key inválida ou ausente. Verifique as configurações.");
    }
    throw new Error(msg);
  }
};

/**
 * Analyzes an exam notice (Edital) PDF.
 */
export const analyzeEdict = async (file: StoredFile, apiKey?: string): Promise<string> => {
  try {
    const ai = getGenAIClient(apiKey);
    const parts: any[] = [];

    const base64Data = file.data.includes(',')
      ? file.data.split(',')[1]
      : file.data;

    parts.push({
      inlineData: {
        mimeType: file.mimeType,
        data: base64Data,
      },
    });

    parts.push({ text: "Analise este edital de concurso e extraia as seguintes informações em formato Markdown claro e estruturado:\n1. Banca Organizadora\n2. Datas Importantes (Inscrição, Prova, etc)\n3. Cargos, Vagas e Salários\n4. Resumo das Etapas do Concurso\n5. Lista de Matérias/Conteúdo Programático para estudar (Agrupado por disciplina). Se houver muitos cargos, foque no geral ou nos principais." });

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: parts
      },
      config: {
        systemInstruction: "Você é um especialista em concursos públicos. Analise o edital com precisão e retorne um resumo formatado em Markdown rico (use tabelas para datas e cargos se possível).",
      }
    });

    return response.text || "Não foi possível gerar a análise.";

  } catch (error: any) {
    console.error("Erro ao analisar edital:", error);
    const msg = error.message || "Falha ao analisar edital.";
    if (msg.includes("API Key")) {
      throw new Error("API Key inválida ou ausente. Verifique as configurações.");
    }
    throw new Error(msg);
  }
};