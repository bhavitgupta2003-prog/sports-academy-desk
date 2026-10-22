// Everything here is FICTIONAL: batches, coaches, students and parents are made up.
// Parent phone numbers use a pattern real Indian mobile numbers can never have (they start with 0).

export type BatchSpec = {
  key: string; // stable name used to build the batch's id
  name: string; // schedule is written into the name, because batches have no schedule column
  coach: string;
  weekdays: number[]; // 0 = Sunday ... 6 = Saturday
  size: number; // how many students
  fee: number; // usual monthly fee in rupees
};

export const BATCHES: BatchSpec[] = [
  { key: "cricket-u12", name: "Cricket U-12 (Mon/Wed/Fri 5 PM)", coach: "Coach Anil Deshmukh", weekdays: [1, 3, 5], size: 18, fee: 2500 },
  { key: "cricket-u16", name: "Cricket U-16 (Tue/Thu/Sat 6 AM)", coach: "Coach Vikram Joshi", weekdays: [2, 4, 6], size: 16, fee: 3000 },
  { key: "football-u14", name: "Football U-14 (Mon/Wed/Fri 6 PM)", coach: "Coach Farhan Qureshi", weekdays: [1, 3, 5], size: 16, fee: 2000 },
  { key: "badminton-juniors", name: "Badminton Juniors (Tue/Thu/Sat 5:30 PM)", coach: "Coach Neha Kulkarni", weekdays: [2, 4, 6], size: 14, fee: 3500 },
  { key: "tennis-beginners", name: "Tennis Beginners (Mon/Wed 4:30 PM)", coach: "Coach Sandeep Rao", weekdays: [1, 3], size: 10, fee: 4500 },
  { key: "swimming-learners", name: "Swimming Learners (Tue/Thu/Sat 7 AM)", coach: "Coach Kavita Nair", weekdays: [2, 4, 6], size: 14, fee: 3000 },
  { key: "basketball-u16", name: "Basketball U-16 (Wed/Fri/Sun 5 PM)", coach: "Coach Rohit Menon", weekdays: [3, 5, 0], size: 12, fee: 2200 },
];

export const FIRST_NAMES = [
  "Aditya", "Advait", "Aryan", "Arnav", "Atharv", "Dev", "Dhruv", "Ishaan", "Kabir", "Karan", "Krish", "Laksh",
  "Madhav", "Neel", "Nikhil", "Om", "Pranav", "Rahul", "Reyansh", "Rishi", "Rudra", "Sahil", "Samar", "Shaurya",
  "Siddharth", "Tanay", "Utkarsh", "Veer", "Vihaan", "Yash", "Ayaan", "Rehan", "Zain",
  "Ananya", "Anika", "Anvi", "Avni", "Diya", "Gauri", "Ira", "Jiya", "Kavya", "Kiara", "Mahi", "Myra", "Navya",
  "Nisha", "Pari", "Prisha", "Riya", "Saanvi", "Sara", "Siya", "Tara", "Trisha", "Vanya", "Zoya", "Aisha", "Alia",
  "Naina", "Tanvi", "Rhea", "Mira", "Aadhya", "Aarna", "Samaira",
];

export const SURNAMES = [
  "Sharma", "Verma", "Gupta", "Singh", "Patel", "Reddy", "Nair", "Iyer", "Menon", "Pillai", "Joshi", "Kulkarni",
  "Deshmukh", "Patil", "Mehta", "Desai", "Bhatt", "Chauhan", "Yadav", "Mishra", "Pandey", "Tiwari", "Banerjee",
  "Mukherjee", "Chatterjee", "Bose", "Roy", "Sen", "Khan", "Ansari", "Siddiqui", "Fernandes", "Thakur", "Malhotra",
  "Kapoor", "Bajaj", "Saxena", "Naidu", "Hegde", "Shetty", "Kamath", "Jain", "Agarwal", "Ghosh",
];

// Parents' first names (none match a coach's first name).
export const PARENT_FIRST_NAMES = [
  "Sunita", "Rajesh", "Meena", "Suresh", "Anita", "Manoj", "Pooja", "Ramesh", "Seema", "Ajay", "Rekha", "Sanjay",
  "Lata", "Deepak", "Geeta", "Mukesh", "Usha", "Naveen", "Shilpa", "Prakash", "Radha", "Girish", "Latha", "Harish",
];

// Names of students that may already exist from earlier testing. Demo students never use these exact names.
export const EXCLUDED_NAMES = ["aarav kumar", "meera shah", "rohan das", "isha rao"];

export const PAYMENT_METHODS = ["UPI", "UPI", "UPI", "Cash", "Bank transfer"];
