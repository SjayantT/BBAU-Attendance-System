const mongoose = require("mongoose");

const facultySchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    password: { type: String, required: true }
});

const subjectSchema= new mongoose.Schema({
    totalClasses:{type: Number, default:0},
    presentCount: {type: Number, default:0},
    presentDates: {type:[String], default:[]},
    absentCount:{type:Number, default:0},
    absentDates:{type:[String], default:[]},
}, {_id:false})

const studentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    roll_no: { type: Number, required: true },
    enrollment: { type: String, required: true },
    subjects:{ type: Map, of: subjectSchema, default:{}}
});

async function IT_db() {
    const IT = await mongoose.createConnection(process.env.IT);

    const IT_faculties = IT.model("IT_faculties", facultySchema, "faculties");
    const IT_student2023 = IT.model("IT_student2023", studentSchema, "student_batch_2023");
    const IT_student2024 = IT.model("IT_student2024", studentSchema, "student_batch_2024");

    return {IT, IT_faculties, IT_student2023, IT_student2024 };
}

module.exports = IT_db;
