import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function cleanAndParseJSON(text) {
  // Remove markdown formatting
  text = text.replace(/```json\n?|\n?```/g, "").trim();
  // Remove any leading or trailing whitespace and newlines
  text = text.replace(/^\s+|\s+$/g, "");
  return JSON.parse(text);
}

export async function generateQuestions(testDetails) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `Generate ${testDetails.numQuestions} multiple-choice questions for a ${testDetails.difficulty} level test on ${testDetails.tags}. 
  The test title is "${testDetails.title}" and the description is "${testDetails.description}". 
  For each question, provide the following details:
  - 'text': The question text as a string.
  - 'options': An array of 4 distinct answer options (as strings).
  - 'correctAnswer': The correct answer as a string, matching one of the options.

  Format the response as a JSON array of objects, each containing 'text', 'options', and 'correctAnswer'. 
  Do not include any markdown formatting or additional text outside of the JSON array.`;

  let rawText = "";
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    rawText = await response.text();

    // Clean and validate the response
    let cleanedText = rawText.trim();
    let parsedQuestions;
    try {
      parsedQuestions = cleanAndParseJSON(cleanedText);
    } catch (_) {
      // Fallback: try to extract JSON array substring
      const startIdx = cleanedText.indexOf("[");
      const endIdx = cleanedText.lastIndexOf("]");
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const jsonSlice = cleanedText.slice(startIdx, endIdx + 1);
        parsedQuestions = JSON.parse(jsonSlice);
      } else {
        throw new Error("Response did not contain a JSON array");
      }
    }

    if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
      throw new Error("Invalid question format");
    }

    return parsedQuestions;
  } catch (error) {
    console.error("Failed to generate questions:", error);
    if (rawText) console.error("Raw response:", rawText);
    throw new Error("Failed to generate questions");
  }
}

export async function verifyTestWithGemini(test, userAnswers) {
  console.log("Verifying test with Gemini...", { test, userAnswers });
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
    Analyze the following test results:
    Test: ${JSON.stringify(test)}
    User Answers: ${JSON.stringify(userAnswers)}

    Please provide:
    1. The score (percentage of correct answers)
    2. Number of correct answers
    3. Number of wrong answers
    4. A brief analysis of the user's performance, including topics they need to improve
    5. For each question, provide:
       - Whether the user's answer was correct or not
       - A brief explanation of why it was correct or incorrect

    Format the response as a JSON object with the following structure:
    {
      "score": number,
      "correctAnswers": number,
      "wrongAnswers": number,
      "analysis": string,
      "questionResults": [
        {
          "isCorrect": boolean,
          "explanation": string
        },
        ...
      ]
    }
  `;

  // Retry up to 3 times to handle transient overloads (503)
  let attempts = 0;
  let lastError;
  let analysisText = "";
  while (attempts < 3) {
    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      analysisText = await response.text();
      break;
    } catch (error) {
      lastError = error;
      const status = error?.status;
      // Backoff for 0.5s, 1s, 1.5s
      await new Promise((r) => setTimeout(r, 500 * (attempts + 1)));
      attempts += 1;
      if (attempts >= 3) {
        throw error;
      }
    }
  }

  console.log("Gemini API response:", analysisText);

  try {
    return cleanAndParseJSON(analysisText);
  } catch (_) {
    try {
      const startIdx = analysisText.indexOf("{");
      const endIdx = analysisText.lastIndexOf("}");
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const jsonSlice = analysisText.slice(startIdx, endIdx + 1);
        return JSON.parse(jsonSlice);
      }
      throw new Error("Response did not contain a JSON object");
    } catch (error) {
      console.error("Failed to parse Gemini response:", error);
      console.error("Raw response:", analysisText);
      throw new Error("Failed to verify test results");
    }
  }
}

export function verifyTestLocally(test, userAnswers) {
  const questionResults = test.questions.map((q) => {
    const userAnswer = userAnswers[q._id];
    const isCorrect = userAnswer === q.correctAnswer;
    return {
      isCorrect,
      explanation: isCorrect
        ? "Correct."
        : `Incorrect. Correct answer: ${q.correctAnswer}`,
    };
  });

  const correctAnswers = questionResults.filter((r) => r.isCorrect).length;
  const wrongAnswers = questionResults.length - correctAnswers;
  const score = Math.round((correctAnswers / questionResults.length) * 100);

  return {
    score,
    correctAnswers,
    wrongAnswers,
    analysis:
      "Automated local verification used due to AI unavailability. Results are based on stored correct answers.",
    questionResults,
  };
}
