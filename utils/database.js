const fs = require('fs');
const path = require('path');

const STUDENTS_FILE = path.join(__dirname, '../data/students.json');
const TEACHERS_FILE = path.join(__dirname, '../data/teachers.json');
const PARENTS_FILE = path.join(__dirname, '../data/parents.json');

// Read all students from file
function getAllStudents() {
  try {
    const data = fs.readFileSync(STUDENTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading students file:', error);
    return [];
  }
}

// Read all teachers
function getAllTeachers() {
  try {
    const data = fs.readFileSync(TEACHERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading teachers file:', error);
    return [];
  }
}

// Read all parents
function getAllParents() {
  try {
    const data = fs.readFileSync(PARENTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading parents file:', error);
    return [];
  }
}

// Find student by name (fuzzy search - matches partial names)
function findStudentByName(name) {
  if (!name) return null;
  
  const students = getAllStudents();
  const searchName = name.toLowerCase().trim();
  
  // Try exact match first
  let student = students.find(s => 
    s.name.toLowerCase() === searchName
  );
  
  if (student) return student;
  
  // Try partial match (includes first name)
  student = students.find(s => {
    const studentFirstName = s.name.toLowerCase().split(' ')[0];
    const searchFirstName = searchName.split(' ')[0];
    return studentFirstName === searchFirstName || 
           s.name.toLowerCase().includes(searchName);
  });
  
  return student || null;
}

// Get student by ID
function getStudentById(id) {
  const students = getAllStudents();
  return students.find(s => s.id === id);
}

// Add new grade for a student
function addGrade(studentName, subject, score) {
  try {
    const students = getAllStudents();
    const student = findStudentByName(studentName);
    
    if (!student) {
      console.log(`Student not found: ${studentName}`);
      return null;
    }
    
    const studentIndex = students.findIndex(s => s.id === student.id);
    
    const newGrade = {
      subject: subject.charAt(0).toUpperCase() + subject.slice(1),
      score: parseInt(score),
      total: 100,
      date: new Date().toISOString().split('T')[0]
    };
    
    students[studentIndex].grades.push(newGrade);
    
    // Save back to file
    fs.writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2));
    
    console.log(`✅ Added grade: ${student.name} - ${subject}: ${score}`);
    return students[studentIndex];
    
  } catch (error) {
    console.error('Error adding grade:', error);
    return null;
  }
}

// Update student attendance
function updateAttendance(studentName, present, absent) {
  try {
    const students = getAllStudents();
    const student = findStudentByName(studentName);
    
    if (!student) return null;
    
    const studentIndex = students.findIndex(s => s.id === student.id);
    
    students[studentIndex].attendance = {
      present: parseInt(present),
      absent: parseInt(absent),
      total_days: parseInt(present) + parseInt(absent)
    };
    
    fs.writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2));
    
    return students[studentIndex];
  } catch (error) {
    console.error('Error updating attendance:', error);
    return null;
  }
}

// Get class statistics
function getClassStats(className) {
  const students = getAllStudents();
  const classStudents = className 
    ? students.filter(s => s.class === className)
    : students;
  
  if (classStudents.length === 0) return null;
  
  const totalStudents = classStudents.length;
  const avgScores = {};
  
  classStudents.forEach(student => {
    student.grades.forEach(grade => {
      if (!avgScores[grade.subject]) {
        avgScores[grade.subject] = { total: 0, count: 0 };
      }
      avgScores[grade.subject].total += grade.score;
      avgScores[grade.subject].count += 1;
    });
  });
  
  const subjectAverages = {};
  Object.keys(avgScores).forEach(subject => {
    subjectAverages[subject] = (avgScores[subject].total / avgScores[subject].count).toFixed(1);
  });
  
  return {
    totalStudents,
    subjectAverages,
    className: className || 'All Classes'
  };
}

// Save students array back to file
function saveStudents(students) {
  try {
    fs.writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving students:', error);
    return false;
  }
}

// Save teachers array
function saveTeachers(teachers) {
  try {
    fs.writeFileSync(TEACHERS_FILE, JSON.stringify(teachers, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving teachers:', error);
    return false;
  }
}

// Save parents array
function saveParents(parents) {
  try {
    fs.writeFileSync(PARENTS_FILE, JSON.stringify(parents, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving parents:', error);
    return false;
  }
}

module.exports = {
  getAllStudents,
  getAllTeachers,
  getAllParents,
  findStudentByName,
  getStudentById,
  addGrade,
  updateAttendance,
  getClassStats,
  saveStudents,
  saveTeachers,
  saveParents
};