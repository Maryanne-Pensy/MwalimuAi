const fs = require('fs');
const path = require('path');

const STUDENTS_FILE = path.join(__dirname, '../data/students.json');
const TEACHERS_FILE = path.join(__dirname, '../data/teachers.json');
const PARENTS_FILE = path.join(__dirname, '../data/parents.json');

// Helper: Read JSON file
function readJsonFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
}

// Helper: Write JSON file
function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    return false;
  }
}

// Helper: Generate unique ID
function generateId(prefix, existingIds) {
  let maxNum = 0;
  existingIds.forEach(id => {
    const numPart = id.replace(prefix, '');
    const num = parseInt(numPart);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  });
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
}

// Register new student
function registerStudent(name, phone, className, parentPhone) {
  try {
    const students = readJsonFile(STUDENTS_FILE);
    
    // Check if student already exists
    const existingStudent = students.find(s => 
      s.phone === phone || s.name.toLowerCase() === name.toLowerCase()
    );
    
    if (existingStudent) {
      return { 
        success: false, 
        message: '❌ Student already registered!\n\n' +
                 `Name: ${existingStudent.name}\n` +
                 `Class: ${existingStudent.class}\n` +
                 `Student ID: ${existingStudent.id}`
      };
    }
    
    // Generate new student ID
    const newId = generateId('', students.map(s => s.id));
    
    // Create new student object
    const newStudent = {
      id: newId,
      name: name.trim(),
      phone: phone.trim(),
      class: className.trim(),
      parent_phone: parentPhone.trim(),
      grades: [],
      attendance: {
        present: 0,
        absent: 0,
        total_days: 0
      },
      weak_areas: [],
      registered_date: new Date().toISOString().split('T')[0]
    };
    
    students.push(newStudent);
    
    if (writeJsonFile(STUDENTS_FILE, students)) {
      console.log(`✅ Student registered: ${name} (${newId})`);
      return { 
        success: true, 
        message: `✅ *STUDENT REGISTERED*\n${'━'.repeat(20)}\n\n` +
                 `👤 Name: *${name}*\n` +
                 `🎓 Class: *${className}*\n` +
                 `📱 Phone: ${phone}\n` +
                 `👨‍👩‍👧 Parent: ${parentPhone}\n` +
                 `🆔 Student ID: *${newId}*\n\n` +
                 `You can now check performance and take quizzes!`,
        student: newStudent
      };
    } else {
      return { success: false, message: '❌ Failed to save student data. Please try again.' };
    }
    
  } catch (error) {
    console.error('Error registering student:', error);
    return { success: false, message: '❌ Registration failed: ' + error.message };
  }
}

// Register new teacher
function registerTeacher(name, phone, subjects, classes) {
  try {
    const teachers = readJsonFile(TEACHERS_FILE);
    
    // Check if teacher already exists
    const existingTeacher = teachers.find(t => 
      t.phone === phone || t.name.toLowerCase() === name.toLowerCase()
    );
    
    if (existingTeacher) {
      return { 
        success: false, 
        message: '❌ Teacher already registered!\n\n' +
                 `Name: ${existingTeacher.name}\n` +
                 `Teacher ID: ${existingTeacher.id}`
      };
    }
    
    // Generate new teacher ID
    const newId = generateId('T', teachers.map(t => t.id));
    
    // Create new teacher object
    const newTeacher = {
      id: newId,
      name: name.trim(),
      phone: phone.trim(),
      subjects: Array.isArray(subjects) ? subjects : [subjects],
      classes: Array.isArray(classes) ? classes : (classes ? [classes] : []),
      registered_date: new Date().toISOString().split('T')[0]
    };
    
    teachers.push(newTeacher);
    
    if (writeJsonFile(TEACHERS_FILE, teachers)) {
      console.log(`✅ Teacher registered: ${name} (${newId})`);
      return { 
        success: true, 
        message: `✅ *TEACHER REGISTERED*\n${'━'.repeat(20)}\n\n` +
                 `👤 Name: *${name}*\n` +
                 `📱 Phone: ${phone}\n` +
                 `📚 Subjects: ${newTeacher.subjects.join(', ')}\n` +
                 `🆔 Teacher ID: *${newId}*\n\n` +
                 `You can now record grades and view class statistics!`,
        teacher: newTeacher
      };
    } else {
      return { success: false, message: '❌ Failed to save teacher data. Please try again.' };
    }
    
  } catch (error) {
    console.error('Error registering teacher:', error);
    return { success: false, message: '❌ Registration failed: ' + error.message };
  }
}

// Register new parent
function registerParent(name, phone, childrenNames) {
  try {
    const parents = readJsonFile(PARENTS_FILE);
    const students = readJsonFile(STUDENTS_FILE);
    
    // Check if parent already exists
    const existingParent = parents.find(p => p.phone === phone);
    
    if (existingParent) {
      return { 
        success: false, 
        message: '❌ Parent already registered!\n\n' +
                 `Use "Link child: [child name]" to add more children.`
      };
    }
    
    // Find children IDs
    const childrenIds = [];
    const childrenArray = Array.isArray(childrenNames) ? childrenNames : [childrenNames];
    const foundChildren = [];
    const notFoundChildren = [];
    
    childrenArray.forEach(childName => {
      const student = students.find(s => 
        s.name.toLowerCase().includes(childName.toLowerCase())
      );
      if (student) {
        childrenIds.push(student.id);
        foundChildren.push(student.name);
      } else {
        notFoundChildren.push(childName);
      }
    });
    
    if (childrenIds.length === 0) {
      return { 
        success: false, 
        message: '❌ No matching students found.\n\n' +
                 'Please ensure students are registered first, or check the spelling.'
      };
    }
    
    // Generate new parent ID
    const newId = generateId('P', parents.map(p => p.id));
    
    // Create new parent object
    const newParent = {
      id: newId,
      name: name.trim(),
      phone: phone.trim(),
      children: childrenIds,
      registered_date: new Date().toISOString().split('T')[0]
    };
    
    parents.push(newParent);
    
    if (writeJsonFile(PARENTS_FILE, parents)) {
      console.log(`✅ Parent registered: ${name} (${newId})`);
      
      let message = `✅ *PARENT REGISTERED*\n${'━'.repeat(20)}\n\n` +
                    `👤 Name: *${name}*\n` +
                    `📱 Phone: ${phone}\n` +
                    `👨‍👩‍👧 Children linked: *${foundChildren.length}*\n` +
                    `🆔 Parent ID: *${newId}*\n\n` +
                    `*Linked children:*\n`;
      
      foundChildren.forEach(child => {
        message += `• ${child}\n`;
      });
      
      if (notFoundChildren.length > 0) {
        message += `\n⚠️ *Not found:* ${notFoundChildren.join(', ')}`;
      }
      
      message += `\nYou can now check your children's performance!`;
      
      return { 
        success: true, 
        message: message,
        parent: newParent
      };
    } else {
      return { success: false, message: '❌ Failed to save parent data. Please try again.' };
    }
    
  } catch (error) {
    console.error('Error registering parent:', error);
    return { success: false, message: '❌ Registration failed: ' + error.message };
  }
}

// Check user type by phone number
function getUserByPhone(phone) {
  const students = readJsonFile(STUDENTS_FILE);
  const teachers = readJsonFile(TEACHERS_FILE);
  const parents = readJsonFile(PARENTS_FILE);
  
  // Normalize phone number
  const normalizedPhone = phone.replace('whatsapp:', '').trim();
  
  // Check if student
  const student = students.find(s => s.phone === normalizedPhone);
  if (student) return { type: 'student', data: student };
  
  // Check if teacher
  const teacher = teachers.find(t => t.phone === normalizedPhone);
  if (teacher) return { type: 'teacher', data: teacher };
  
  // Check if parent
  const parent = parents.find(p => p.phone === normalizedPhone);
  if (parent) return { type: 'parent', data: parent };
  
  return { type: 'unknown', data: null };
}

module.exports = {
  registerStudent,
  registerTeacher,
  registerParent,
  getUserByPhone
};