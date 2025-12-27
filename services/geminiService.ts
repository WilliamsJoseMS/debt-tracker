import { GoogleGenAI } from "@google/genai";
import { Payment, Debt, AnalysisResult } from "../types";

const apiKey = process.env.API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

export const analyzeDebtProgress = async (
  debt: Debt,
  payments: Payment[]
): Promise<AnalysisResult> => {
  if (!apiKey) {
    return {
      message: "Configura tu API Key para obtener consejos inteligentes.",
      tone: "neutral",
    };
  }

  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  const remaining = debt.totalAmount - totalPaid;
  const percentage = (totalPaid / debt.totalAmount) * 100;

  // Prepare a concise summary for the model
  const prompt = `
    Act as a friendly financial assistant. Analyze this personal debt situation.
    
    Data:
    - Debt to: ${debt.creditorName}
    - Total Debt: €${debt.totalAmount}
    - Total Paid: €${totalPaid}
    - Remaining: €${remaining}
    - Percentage Paid: ${percentage.toFixed(1)}%
    - Number of payments made: ${payments.length}
    - Recent payments: ${JSON.stringify(payments.slice(0, 5))}

    Task:
    Provide a short, encouraging summary in Spanish (max 3 sentences). 
    If they are making good progress, congratulate them. 
    If they haven't paid anything recently, gently encourage them.
    Estimate when they might finish if the payment consistency continues (rough guess).

    Return ONLY raw JSON with this structure:
    {
      "message": "The summary text...",
      "estimatedCompletion": "Estimated date or text (optional)",
      "tone": "positive" | "neutral" | "concerned"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const result = JSON.parse(text) as AnalysisResult;
    return result;
  } catch (error) {
    console.error("Gemini analysis failed", error);
    return {
      message: "No se pudo generar el análisis en este momento.",
      tone: "neutral",
    };
  }
};