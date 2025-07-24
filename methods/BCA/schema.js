const mongoose = require("mongoose");
require("dotenv").config();

const facultySchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    password: { type: String, required: true }
});

const subjectSchema= new mongoose.Schema({
    totalClasses:{type:Number, default:0},
    presentCount:{type:Number, default:0},
    presentDates:{type:[String], default:[]},
    absentCount:{type:Number, default:0},
    absentDates:{type:[String], default:[]},
}, {_id:false});

const studentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    roll_no: { type: Number, required: true },
    enrollment: { type: String, required: true },
    subjects: {type:Map, of: subjectSchema , default:{}}
});

async function BCA_db() {
    const BCA = await mongoose.createConnection("mongodb+srv://sahil_jayant0001:drrnkatiyar321A@cluster0.qe2zyph.mongodb.net/BCA?retryWrites=true&w=majority&appName=Cluster0");

    const BCA_faculties = BCA.model("BCA_faculties", facultySchema, "faculties");
    const BCA_student2023 = BCA.model("BCA_student2023", studentSchema, "student_batch_2023");
    const BCA_student2024 = BCA.model("BCA_student2024", studentSchema, "student_batch_2024");

    return { BCA, BCA_faculties, BCA_student2023, BCA_student2024 };
}

module.exports = BCA_db;
