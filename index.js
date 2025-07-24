const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
const path = require("path");
const ejsMate= require("ejs-mate");
const BCA_db = require("./methods/BCA/schema");
const IT_db = require("./methods/Bsc IT/schema");

app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.engine("ejs", ejsMate);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

require("dotenv").config();
const{MongoClient}= require("mongodb");
const url= process.env.uri;
const client= new MongoClient(url);


async function startServer() {
    try {
        const { BCA, BCA_faculties, BCA_student2023, BCA_student2024 } = await BCA_db();
        console.log("The database is connected with BCA models");

        const { IT, IT_faculties, IT_student2023, IT_student2024 } = await IT_db();
        console.log("The database is connected with IT models");

        app.get("/", async (req, res) => {
            res.render("./Frontend/index.ejs");
        });

        app.get("/departments", (req,res)=>{
            res.render("./Frontend/departments.ejs")
        });
        
        app.get("/departments/:course", async (req,res)=>{
            const courseName= req.params.course;
            await client.connect();
            const db= client.db(courseName);
            const collections= await db.listCollections().toArray();
            const collectionsName= collections.map(col =>col.name);
            res.render("./Frontend/batch.ejs",{data:collectionsName, courseName});
        });

        app.get("/departments/:course/:batch/verify", async (req,res)=>{
            const courseName= req.params.course.trim();
            const batchName= req.params.batch.trim();
            const db= client.db(courseName);
            const collections= await db.listCollections().toArray();
            const subjectsCollection = db.collection("subjects");
            const subjects = await subjectsCollection.find().toArray();
            res.render("./Frontend/verify.ejs",{data:subjects[0], courseName, batchName});
            
        });

        app.post("/departments/:course/:batch/verify/attendance", async(req,res)=>{
            const courseName= req.params.course.trim();
            const batchName= req.params.batch.trim();
            const {facultyId, facultyPass, semester, subject} = req.body;
            await client.connect();
            const db= client.db(courseName);
            const faculties= db.collection("faculties");
            const faculty = await faculties.findOne({id:facultyId})
            if(!faculty){
                const msg= "Faculty not found! Please check the Faculty ID.";
                res.render("./Frontend/warning.ejs",{msg});
                return;
            }
            if(facultyPass != faculty.password){
                const msg= "Incorrect password! Please try again.";
                res.render("./Frontend/warning.ejs",{msg});
                return;
            } else{
                const studentCollection= db.collection(batchName);
                const students= await studentCollection.find().toArray();
                res.render("./Frontend/attendance.ejs",{data:students, courseName, batchName, semester, subject ,facultyName: faculty.name});
            }
        });

        // this route is saving attendance data
        app.post("/departments/:course/:batch/:semester/:subject/submit-attendance", async (req, res) => {
        const { course, batch, subject } = req.params;
        const attendanceList = req.body.attendance;
        const today = new Date().toISOString().slice(0, 10);

        try {
            await client.connect();
            const db = client.db(course);
            const studentCollection = db.collection(batch);

            for (let entry of attendanceList) {
            const roll = parseInt(entry.rollNo);
            const status = entry.status;

            const student = await studentCollection.findOne({ roll_no: roll });
            if (!student) continue;

            const subjData = student.subjects?.[subject];

            const isAlreadyPresent = subjData?.presentDates?.includes(today);
            const isAlreadyAbsent = subjData?.absentDates?.includes(today);

            // If already marked, remove old status
            if (isAlreadyPresent || isAlreadyAbsent) {
                const updateRemove = {
                $pull: {
                    [`subjects.${subject}.presentDates`]: today,
                    [`subjects.${subject}.absentDates`]: today
                },
                $inc: {
                    [`subjects.${subject}.presentCount`]: isAlreadyPresent ? -1 : 0,
                    [`subjects.${subject}.absentCount`]: isAlreadyAbsent ? -1 : 0
                }
                };
                await studentCollection.updateOne({ roll_no: roll }, updateRemove);
            } else {
                // Increment total only if new record
                await studentCollection.updateOne(
                { roll_no: roll },
                { $inc: { [`subjects.${subject}.totalClasses`]: 1 } }
                );
            }

            // Push new status
            const updateAdd = {
                $push: {},
                $inc: {}
            };

            if (status === "Present") {
                updateAdd.$push[`subjects.${subject}.presentDates`] = today;
                updateAdd.$inc[`subjects.${subject}.presentCount`] = 1;
            } else {
                updateAdd.$push[`subjects.${subject}.absentDates`] = today;
                updateAdd.$inc[`subjects.${subject}.absentCount`] = 1;
            }

            await studentCollection.updateOne(
                { roll_no: roll },
                updateAdd,
                { upsert: true }
            );
            }

            res.json({ success: true, redirectUrl: `/departments/${course}/submitted` });

        } catch (err) {
            console.error("Submit Error:", err);
            res.status(500).json({ success: false, error: "Error submitting attendance" });
        }
        });

        app.get("/departments/:course/submitted", (req, res) => {
            const courseName = req.params.course.trim();
            res.render("./Frontend/submitted.ejs", {courseName});
        });

        
        app.get("/departments/:course/:batch/students", async(req,res)=>{
            const courseName= req.params.course.trim();
            const batchName= req.params.batch.trim();
            await client.connect();
            const db= client.db(courseName);
            const subjectsCollection = db.collection("subjects");
            const subjects= await subjectsCollection.find().toArray();
            res.render("./Frontend/students_verify.ejs",{data: subjects[0], courseName, batchName});            
        });

        app.post("/departments/:course/:batch/students/attendance", async(req,res)=>{
            const courseName= req.params.course.trim();
            const batchName= req.params.batch.trim();
            const {rollNo, semester, subject, enrollmentNo} = req.body;
            const roll= parseInt(rollNo);
            await client.connect();
            const db= client.db(courseName);
            const studentCollection= db.collection(batchName);
            const student = await studentCollection.findOne({roll_no: roll});
            if(!student || student.enrollment!== enrollmentNo){
                const msg= "Student not found! Please check the Roll Number and Enrollment Number.";
                res.render("./Frontend/warning.ejs",{msg});
                return;
            }
            const subjectData = student.subjects && student.subjects[subject];
            
            if(!subjectData){
                res.render("./Frontend/noClass.ejs", {student,subject, courseName, batchName: batchName.slice(14  ,18)});
            } else{
                const totalClasses= subjectData.totalClasses;
                const presentCounts = subjectData.presentCount || 0;
                const absentCounts= subjectData.absentCount || 0;
                res.render("./Frontend/students_attendance.ejs",{subject, totalClasses, presentCounts, absentCounts, student, courseName, batchName: batchName.slice(14,18), semester});
            }
        });
 
        // change password route
        app.get("/departments/:course/:batch/changePassword", async(req,res)=>{
            const courseName= req.params.course.trim();
            const batchName= req.params.batch.trim();
            res.render("./Frontend/changePassword.ejs",{courseName, batchName});
        });

        app.post("/departments/:course/:batch/changePassword/success",async(req,res)=>{
            const courseName= req.params.course.trim();
            const {facultyId, oldPass, newPass, confirmPass}= req.body;
            await client.connect();
            const db= client.db(courseName);
            const faculties= db.collection("faculties");
            const faculty= await faculties.findOne({id: facultyId});
            if(!faculty){
                const msg= "Faculty not found! Please check the Faculty ID.";
                res.render("./Frontend/warning.ejs",{msg});
                return;
            }else if(oldPass !== faculty.password){
                const msg= "Incorrect old password! Please try again.";
                res.render("./Frontend/warning.ejs",{msg});
                return;
            } else if(newPass !== confirmPass){
                const msg= "New password and confirm password do not match! Please try again.";
                res.render("./Frontend/warning.ejs",{msg});
                return;
            } else{
                await faculties.updateOne({ id: facultyId}, { $set: {password: newPass}});
                res.redirect(`/departments/${courseName}`); 
                
            }
        });

        // fetch attendance route
        app.get("/departments/:course/fetch-attendance", async(req,res)=>{
            const courseName= req.params.course.trim();
            await client.connect();
            const db= client.db(courseName);
            const batchCollections= await db.listCollections().toArray();
            const batches = batchCollections.map(batch => batch.name);
            const subjectsCollection= db.collection("subjects");
            const subjects = await subjectsCollection.find().toArray();
            res.render("./Frontend/fetch.ejs",{data: subjects[0], courseName, batches});
        });
            
        app.post("/departments/:course/fetch-attendance/result",async(req,res)=>{
            const courseName= req.params.course.trim();
            const {batch, semester, subject}= req.body;
            await client.connect();
            const db= client.db(courseName);
            const studentCollection= db.collection(batch);
            const students = await studentCollection.find().toArray();
            const subjectData = students[0].subjects && students[0].subjects[subject];
            if(!subjectData){
                const msg= `No attendance data found for "${subject}"!`;
                res.render("./Frontend/warning.ejs",{msg});
                return;
            }
            else {
                const attendanceList = students.map(student => {
                    const subj = student.subjects[subject];
                    return {
                        name: student.name,
                        rollNo: student.roll_no,
                        present: subj.presentCount || 0,
                        total: subj.totalClasses,
                        percentage: ((subj.presentCount / subj.totalClasses) * 100).toFixed(2)
                    };
                });


                res.render("./Frontend/result.ejs", {courseName,batchName:batch,semester,subject,attendanceList});
            }
        });

        // route for downloading attendance pdf
        const PDFDocument = require('pdfkit');
        const fs = require('fs');
        const path = require('path');

        app.post("/departments/:course/fetch-attendance/pdf", async (req, res) => {
        const courseName = req.params.course.trim();
        const { batch, semester, subject } = req.body;

        try {
            await client.connect();
            const db = client.db(courseName);
            const studentCollection = db.collection(batch);
            const students = await studentCollection.find().toArray();

            if (!students || students.length === 0) {
            return res.status(404).send("No student data found!!");
            }

            const doc = new PDFDocument({ margin: 50 });
            res.setHeader('Content-disposition', `attachment; filename=${subject}_attendance-report.pdf`);
            res.setHeader('Content-type', 'application/pdf');
            doc.pipe(res);

            const logoPath = path.join(__dirname, 'public', 'images', 'logo.png');
            const photoPath = path.join(__dirname, 'public', 'images', 'ambedkar2.jpg')
            const columnWidths = [30, 140, 80, 60, 50, 50, 70];
            const headers = ["S.No", "Name", "Roll No","Total", "Present", "Absent", "Percentage"];
            const startX = 50;
            const maxY = 750;
            let rowY = 260;
            let index = 1;
            let page = 1;

            const drawHeader = () => {
            if (page === 1) {
                if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 30, 35, { width: 60 });
                }
                if (fs.existsSync(photoPath)) {
                doc.image(photoPath, 480, 35, { width: 60 });
                }

                doc.fillColor('#003366')
                .fontSize(17)
                .font('Helvetica-Bold')
                .text('Babasaheb Bhimrao Ambedkar University ', 0, 45, { align: 'center'});

                doc.fillColor('#003366')
                .fontSize(10)
                .font('Helvetica-Bold')
                .text('(A central University)', 0, 65, { align: 'center'});

                doc.fillColor('#003366')
                .fontSize(14)
                .font('Helvetica-Bold')
                .text('Satellite Centre Amethi-227413', 0, 80, { align: 'center'});

                doc.fillColor('#000000')
                .fontSize(15)
                .font('Helvetica-Bold')
                .text('Attendance-Report', 0, 110, { align: 'center', underline:true});


                doc.moveDown(1);
                doc.fillColor('black').fontSize(12).font('Helvetica');
                doc.text(`     Course: ${courseName}`);
                const batchName= batch.slice(14,18);
                doc.text(`     Batch: ${batchName}`);
                doc.text(`     Semester: ${semester}`);
                doc.text(`     Subject: ${subject}`);
                doc.moveDown(1);
                const lineY = doc.y;
                doc.lineWidth(1).strokeColor('#000000').moveTo(0, lineY).lineTo(600, lineY).stroke();
                rowY = lineY + 30;
            }

            // Table headers
            let x = startX;
            headers.forEach((header, i) => {
                doc.font("Helvetica-Bold").fontSize(11).text(header, x, rowY, {
                width: columnWidths[i],
                align: "center",
                });
                x += columnWidths[i];
            });

            doc.moveTo(startX, rowY + 15).lineTo(550, rowY + 15).stroke();
            rowY += 25;
            };

            drawHeader();

            students.forEach((student) => {
            const subjData = student.subjects[subject];
            if (!subjData) return;

            const name = student.name || "N/A";
            const roll = student.roll_no || "N/A";
            const total = subjData.totalClasses || 0;
            const present = subjData.presentCount || 0;
            const absent = subjData.absentCount || 0;
            const percentage = total > 0 ? ((present / total) * 100).toFixed(1) + "%" : "N/A";

            // Page break check
            if (rowY + 20 > maxY) {
                doc.addPage();
                page++;
                rowY = 100;
                drawHeader();
            }

            const row = [
                index.toString(),
                name,
                roll.toString(),
                total.toString(),
                present.toString(),
                absent.toString(),
                percentage,
            ];

            let colX = startX;
            row.forEach((data, i) => {
                doc.font("Helvetica").fontSize(10).fillColor('black').text(data, colX, rowY, {
                width: columnWidths[i],
                align: "center",
                });
                colX += columnWidths[i];
            });

            rowY += 20;
            index++;
            });

            // Final footer (only once)
            doc.moveDown(4.5);
            doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 60);
            doc.moveDown(0.2);
            doc.text('Signature: _____________________', 370);
            doc.fontSize(10).fillColor('#666').text('Powered by BBAU Attendance System', 0, 730, { align: 'center' });

            doc.end();
        } catch (err) {
            console.error("PDF error:", err);
            res.status(500).send("PDF Generation Failed");
        }
        });

        // route for filtering attendance by date
        app.post("/departments/:course/fetch-attendance/by-date", async (req, res) => {
        const course = req.params.course.trim();
        const { batch, semester, subject, date } = req.body;
        let hasUnmarked= false;
        try {
            await client.connect();
            const db = client.db(course);
            const studentCollection = db.collection(batch);
            const students = await studentCollection.find().toArray();

            const filtered = students.map(student => {
            // Access subject data from Map
            const subjData = student.subjects[subject];
            if (!subjData || typeof subjData !== 'object') return null;

            const isPresent = Array.isArray(subjData.presentDates) && subjData.presentDates.includes(date);
            const isAbsent = Array.isArray(subjData.absentDates) && subjData.absentDates.includes(date);

            let status= "Not Marked";
            if(isPresent) status="Present";
            else if(isAbsent) status= "Absent";
            else hasUnmarked= true;

            return {
                name: student.name,
                roll_no: student.roll_no,
                status: isPresent ? "Present" : isAbsent ? "Absent" : "Not Marked"
            };
            }).filter(Boolean); // remove null entries

            if(hasUnmarked){
                const msg= `No attendance data found for "${subject}" on "${date}"!`;
                res.render("./Frontend/warning.ejs",{msg});
                return;
            }

            filtered.sort((a, b) => a.roll_no - b.roll_no);
            res.render("./Frontend/fetch-by-date.ejs", {date, courseName:course, batchName: batch, semester, subject, students: filtered});

        } catch (err) {
            console.error(" Error filtering attendance by date:", err);
            res.status(500).send("Error filtering attendance by date");
        }
        });

        // route to download filted attendance data in pdf format
        app.post("/departments/:course/fetch-attendance/by-date/pdf", async (req, res) => {
        const courseName = req.params.course.trim();
        const { batch, semester, subject, date } = req.body;

        try {
            await client.connect();
            const db = client.db(courseName);
            const studentCollection = db.collection(batch);
            const students = await studentCollection.find().toArray();

            const filtered = students.map(student => {
            const subjData = student.subjects[subject];
            if (!subjData) return null;

            const isPresent = Array.isArray(subjData.presentDates) && subjData.presentDates.includes(date);
            const isAbsent = Array.isArray(subjData.absentDates) && subjData.absentDates.includes(date);

            return {
                name: student.name,
                roll_no: student.roll_no,
                status: isPresent ? "Present" : isAbsent ? "Absent" : "Not Marked"
            };
            }).filter(Boolean);

            // Sort by roll number
            filtered.sort((a, b) => a.roll_no - b.roll_no);

            // === PDF Setup
            const doc = new PDFDocument({ margin: 50 });
            res.setHeader('Content-disposition', `attachment; filename=${subject}_attendance_${date}.pdf`);
            res.setHeader('Content-type', 'application/pdf');
            doc.pipe(res);

            const logoPath = path.join(__dirname, 'public', 'images', 'logo.png');
            const photoPath = path.join(__dirname, 'public', 'images', 'ambedkar2.jpg');
            const columnWidths = [40, 200, 100, 100];
            const headers = ["S.No", "Name", "Roll No", "Status"];
            const startX = 50;
            const maxY = 750;
            let rowY = 260;
            let index = 1;
            let page = 1;

            const drawHeader = () => {
            if (page === 1) {
                if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 30, 35, { width: 60 });
                }
                if (fs.existsSync(photoPath)) {
                doc.image(photoPath, 480, 35, { width: 60 });
                }

                doc.fillColor('#003366').fontSize(17).font('Helvetica-Bold').text(
                'Babasaheb Bhimrao Ambedkar University', 0, 45, { align: 'center' });

                doc.fontSize(10).text('(A Central University)', 0, 65, { align: 'center' });
                doc.fontSize(14).text('Satellite Centre Amethi - 227413', 0, 80, { align: 'center' });

                doc.fillColor('#000000').fontSize(15).text('Attendance Report', 0, 110, { align: 'center', underline: true });

                doc.moveDown(1);
                doc.fillColor('black').fontSize(12).font('Helvetica');
                const batchName = batch.slice(14, 18);
                doc.text(`     Course: ${courseName}`);
                doc.text(`     Batch: ${batchName}`);
                doc.text(`     Semester: ${semester}`);
                doc.text(`     Subject: ${subject}`);
                doc.text(`     Date: ${new Date(date).toLocaleDateString('en-GB')}`);
                doc.moveDown(1);
                const lineY = doc.y;
                doc.lineWidth(1).strokeColor('#000000').moveTo(0, lineY).lineTo(600, lineY).stroke();
                rowY = lineY + 30;
            }

            // Table headers
            let x = startX;
            headers.forEach((header, i) => {
                doc.font("Helvetica-Bold").fontSize(11).text(header, x, rowY, {
                width: columnWidths[i],
                align: "center",
                });
                x += columnWidths[i];
            });

            doc.moveTo(startX, rowY + 15).lineTo(550, rowY + 15).stroke();
            rowY += 25;
            };

            drawHeader();

            filtered.forEach(student => {
            if (rowY + 20 > maxY) {
                doc.addPage();
                page++;
                rowY = 100;
                drawHeader();
            }

            const row = [
                index.toString(),
                student.name,
                student.roll_no.toString(),
                student.status
            ];

            let colX = startX;
            row.forEach((data, i) => {
                doc.font("Helvetica").fontSize(10).fillColor('black').text(data, colX, rowY, {
                width: columnWidths[i],
                align: "center",
                });
                colX += columnWidths[i];
            });

            rowY += 20;
            index++;
            });

            // Final footer
            doc.moveDown(4);
            doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, 60);
            doc.moveDown(0.2);
            doc.text('Signature: _____________________', 370);
            doc.fontSize(10).fillColor('#666').text('Powered by BBAU Attendance System', 0, 730, { align: 'center' });

            doc.end();
        } catch (err) {
            console.error("PDF error:", err);
            res.status(500).send("PDF generation failed.");
        }
        });




    app.listen(port, () => {
            console.log(`The app is running on port ${port}`);
        });
    } catch (err) {
        console.error("Failed to start server:", err);
    }
}

startServer();
