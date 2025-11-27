const { GoogleGenerativeAI } = require("@google/generative-ai");
const { findStudentByName } = require("../utils/database");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL = "gemini-1.5-flash";


async function detectIntent(message) {
  const prompt = `Analyze: "${message}" - Reply with ONE of: QUIZ_ANSWER (ONLY if message is 2-5 letters like "A C B" or "1A 2C 3B"), REGISTER_STUDENT, REGISTER_TEACHER, REGISTER_PARENT, CHECK_PERFORMANCE, QUIZ_REQUEST, RECORD_GRADES, CLASS_STATS, or HELP`;
  
  try {
    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    // IMPROVED fallback with quiz answer detection
    const msg = message.toLowerCase().trim();
    
    // Check for quiz answers FIRST (highest priority)
    const quizAnswerPattern = /^(\d+[a-d]\s*){2,5}$/i;
    const shortAnswerPattern = /^[a-d](\s+[a-d]){1,4}$/i;
    if (quizAnswerPattern.test(msg.replace(/\s+/g, ' ')) || 
        shortAnswerPattern.test(msg.replace(/\s+/g, ' '))) {
      return "QUIZ_ANSWER";
    }
    
    // Then check other intents
    if (msg.includes("register student")) return "REGISTER_STUDENT";
    if (msg.includes("register teacher")) return "REGISTER_TEACHER";
    if (msg.includes("register parent")) return "REGISTER_PARENT";
    if (msg.includes("check") || msg.includes("performance")) return "CHECK_PERFORMANCE";
    if (msg.includes("quiz")) return "QUIZ_REQUEST";
    if (msg.includes("record grade")) return "RECORD_GRADES";
    if (msg.includes("class stat")) return "CLASS_STATS";
    
    return "HELP";
  }
}
function extractStudentName(message) {
  const patterns = [
    /check\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /performance\s+(?:of|for)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'?s?\s+(?:performance|grades|report)/i,
  ];

  for (const p of patterns) {
    const match = message.match(p);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

function generatePerformanceReport(student) {
  if (!student) return "❌ *Student not found*";
  
  const avg = student.grades.reduce((sum, g) => sum + g.score, 0) / student.grades.length;
  const attendance = ((student.attendance.present / student.attendance.total_days) * 100).toFixed(1);

  let report = `📊 *PERFORMANCE REPORT*\n━━━━━━━━━━━━━━━━━━\n\n`;
  report += `👤 *Name:* ${student.name}\n🎓 *Class:* ${student.class}\n\n`;
  report += `📚 *RECENT GRADES*\n━━━━━━━━━━━━━━━━━━\n`;

  student.grades.slice(-5).forEach((g) => {
    const pct = ((g.score / g.total) * 100).toFixed(0);
    const emoji = g.score >= 80 ? "🟢" : g.score >= 70 ? "🟡" : g.score >= 50 ? "🟠" : "🔴";
    report += `${emoji} *${g.subject}:* ${g.score}/${g.total} (${pct}%)\n`;
  });

  report += `\n📈 *STATISTICS*\n━━━━━━━━━━━━━━━━━━\n`;
  report += `• Average: *${avg.toFixed(1)}%*\n`;
  report += `• Attendance: *${attendance}%*\n`;

  return report;
}

async function generateQuiz(subject) {
  const prompt = `Create 3 multiple choice questions about ${subject} for Kenyan high school students. Format: Question 1: [question] A) B) C) D)`;
  
  try {
    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    return `Question 1: What is 15 × 4? A) 45 B) 60 C) 50 D) 55\nQuestion 2: Solve 2x + 5 = 15 A) x=10 B) x=5 C) x=7.5 D) x=8\nQuestion 3: Area of rectangle? A) 13 B) 40 C) 26 D) 45`;
  }
}

function parseGradeRecording(message) {
  const records = [];
  const pattern = /([A-Za-z\s]+)\s+([A-Za-z]+)\s+(\d+)/gi;
  let match;
  
  while ((match = pattern.exec(message)) !== null) {
    records.push({
      studentName: match[1].trim(),
      subject: match[2].trim(),
      score: parseInt(match[3]),
      total: 100
    });
  }
  return records;
}

function extractSubject(message) {
  const subjects = ["math", "mathematics", "english", "science", "kiswahili"];
  const msg = message.toLowerCase();
  const found = subjects.find((s) => msg.includes(s));
  return found ? found.charAt(0).toUpperCase() + found.slice(1) : "Mathematics";
}

function parseStudentRegistration(message) {
  // More flexible pattern matching
  const patterns = [
    /register\s+(?:as\s+)?student:?\s*([^,]+),\s*([^,]+),\s*(\+?254\d{9})/i,
    /register\s+student\s+([^,]+),\s*([^,]+),\s*(\+?254\d{9})/i,
    /student:?\s*([^,]+),\s*([^,]+),\s*(\+?254\d{9})/i
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        name: match[1].trim(),
        class: match[2].trim(),
        parentPhone: match[3].trim()
      };
    }
  }
  return null;
}


function parseTeacherRegistration(message) {
  // More flexible pattern matching
  const patterns = [
    /register\s+(?:as\s+)?teacher:?\s*([^,]+),\s*(.+)/i,
    /register\s+teacher\s+([^,]+),\s*(.+)/i,
    /teacher:?\s*([^,]+),\s*(.+)/i
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const subjects = match[2].split(/(?:,|and)\s*/).map(s => s.trim());
      return {
        name: match[1].trim(),
        subjects: subjects
      };
    }
  }
  return null;
}


function parseParentRegistration(message) {
  // More flexible pattern matching
  const patterns = [
    /register\s+(?:as\s+)?parent:?\s*([^,]+),\s*(\+?254\d{9}),?\s*(?:for|child:?)\s*([^,]+)/i,
    /register\s+parent\s+([^,]+),\s*(\+?254\d{9}),?\s*(?:for|child:?)\s*([^,]+)/i,
    /parent:?\s*([^,]+),\s*(\+?254\d{9}),?\s*(?:for|child:?)\s*([^,]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        name: match[1].trim(),
        phone: match[2].trim(),
        childName: match[3].trim()
      };
    }
  }
  
  // Alternative: "Register parent for ChildName"
  const altPattern = /register\s+(?:as\s+)?parent\s+for\s+([A-Za-z\s]+)/i;
  const altMatch = message.match(altPattern);
  if (altMatch) {
    return {
      name: null,
      phone: null,
      childName: altMatch[1].trim()
    };
  }
  
  return null;
}

module.exports = {
  detectIntent, extractStudentName, generatePerformanceReport, generateQuiz,
  parseGradeRecording, extractSubject, parseStudentRegistration,
  parseTeacherRegistration, parseParentRegistration
};