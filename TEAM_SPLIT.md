# TEAM_SPLIT.md

## ข้อมูลกลุ่ม
- กลุ่มที่: sec2 group4
- รายวิชา: ENGSE207 Software Architecture

## รายชื่อสมาชิก
- 67543210014-6 นายจิรกิตติ์ คำป่าตัน
- 67543210051-8 นางสาวกฤตพร แหลมไทย

## การแบ่งงานหลัก

### สมาชิกคนที่ 1: นายจิรกิตติ์ คำป่าตัน
รับผิดชอบงานหลักดังต่อไปนี้
- พัฒนาระบบ Backend Services ทั้งหมด (Auth Service, Task Service, Activity Service)
- ออกแบบโครงสร้างฐานข้อมูล (Database Schema) แยกตาม Service
- ตั้งค่า Docker Compose และเขียนการเชื่อมต่อระบบไปยัง Railway Cloud Deployment

### สมาชิกคนที่ 2: นางสาวกฤตพร แหลมไทย
รับผิดชอบงานหลักดังต่อไปนี้
- พัฒนาระบบ Frontend / User Interface (index.html, activity.html)
- ออกแบบและปรับแต่งหน้า Dashboard การใช้งานของระบบ Task Board
- เขียนสคริปต์สำหรับการเรียกใช้ API (Integration) ฝั่ง Client กับ Backend Services ทั้ง 3 ตัว

## งานที่ดำเนินการร่วมกัน
- ออกแบบภาพรวมของระบบการทำงาน (Architecture Design)
- ทดสอบการทำงานร่วมกันระหว่าง Frontend และ Backend (End-to-End Testing)
- จัดทำเอกสารและรวบรวม Screenshots ประกอบการส่งงาน

## เหตุผลในการแบ่งงาน
แบ่งตามความถนัดของสมาชิกในทีม โดยผู้ที่ถนัดโครงสร้างระบบและลอจิกเบื้องหลังจะมุ่งเน้นที่ Services และ Database เพื่อให้ API เสถียรที่สุด ในขณะที่ผู้ที่ถนัดการออกแบบส่วนติดต่อผู้ใช้จะสามารถโฟกัสไปที่หน้าเว็บ การแสดงผลลัพธ์ข้อมูลจาก API และ User Experience ฝั่ง Frontend ได้อย่างเต็มที่

## สรุปการเชื่อมโยงงานของสมาชิก
งานของทั้งสองคนเชื่อมโยงกันอย่างเป็นระบบผ่าน REST API และ configuration mapping โดยฝั่ง Backend (นายจิรกิตติ์) จะเป็นผู้จัดเตรียม Endpoint URLs สำหรับ Authenticate, ดึง Task, และบันทึก Activity Logs ขึ้นบน Railway Cloud จากนั้นฝั่ง Frontend (นางสาวกฤตพร) จะนำ URL เหล่านี้ไปตั้งค่าใน `config.js` เพื่อให้ Web Application สามารถแสดงผลและโต้ตอบกับฐานข้อมูลแต่ละส่วนได้จริง