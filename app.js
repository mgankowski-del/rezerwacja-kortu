import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, deleteDoc, doc, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC_yoH8VeSKl41tOBJnwZpLHwmzjQJhrZc",
  authDomain: "kort-tenisowy.firebaseapp.com",
  projectId: "kort-tenisowy",
  storageBucket: "kort-tenisowy.firebasestorage.app",
  messagingSenderId: "383734758095",
  appId: "1:383734758095:web:ec75c1317d3deddefd15ba"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const reservationsCol = collection(db, "reservations");

let allReservations = [];
let selectedSlots = [];

function renderCalendar() {
    const calendarEl = document.getElementById("calendar");
    if (!calendarEl) return;
    calendarEl.innerHTML = "";

    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayCol = document.createElement("div");
        dayCol.className = "day-column";
        dayCol.innerHTML = `<div class="day-header">
            <strong>${d.toLocaleDateString('pl-PL', { weekday: 'short' })}</strong><br>
            <span>${d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}</span>
        </div>`;

        for (let hour = 6; hour < 23; hour++) {
            for (let min of ["00", "30"]) {
                const timeStr = `${hour.toString().padStart(2, '0')}:${min}`;
                const fullIso = `${dateStr}T${timeStr}`;
                const slotDiv = document.createElement("div");
                slotDiv.className = "time-slot";

                const res = allReservations.find(r => 
                    (r.date === dateStr && r.time === timeStr) || 
                    (r.bookedTimes && r.bookedTimes.includes(fullIso))
                );

                if (res) {
                    slotDiv.classList.add("booked");
                    const name = res.surname ? `${res.firstName} ${res.surname}` : res.firstName;
                    slotDiv.innerHTML = `<strong>${timeStr}</strong>${name}`;
                    slotDiv.onclick = () => cancelReservation(res);
                } else {
                    slotDiv.innerText = timeStr;
                    if (selectedSlots.some(s => s.date === dateStr && s.time === timeStr)) slotDiv.classList.add("selected");
                    slotDiv.onclick = () => toggleSelectSlot(dateStr, timeStr);
                }
                dayCol.appendChild(slotDiv);
            }
        }
        calendarEl.appendChild(dayCol);
    }
}

function toggleSelectSlot(date, time) {
    const idx = selectedSlots.findIndex(s => s.date === date && s.time === time);
    if (idx > -1) selectedSlots.splice(idx, 1);
    else {
        if (selectedSlots.length >= 4) return alert("Maksymalnie 2 godziny!");
        selectedSlots.push({ date, time });
    }
    document.getElementById("reserveBtn").style.display = selectedSlots.length > 0 ? "block" : "none";
    renderCalendar();
}

async function confirmBooking() {
    const fName = document.getElementById("inputFirstName").value;
    const addr = document.getElementById("inputAddress").value;
    const pin = document.getElementById("inputPin").value;
    if (!fName || !addr || pin.length < 4) return alert("Wypełnij wszystko (PIN min. 4 cyfry)!");

    for (let s of selectedSlots) {
        await addDoc(reservationsCol, { ...s, firstName: fName, address: addr, pin: pin });
    }
    selectedSlots = [];
    document.getElementById("bookingModal").classList.remove("active");
    document.getElementById("successPin").innerText = pin;
    document.getElementById("successModal").classList.add("active");
}

async function cancelReservation(res) {
    const pin = prompt(`Podaj PIN dla rezerwacji ${res.firstName}:`);
    if (pin === res.pin || pin === "9988") {
        if (confirm("Usunąć rezerwację?")) {
            const toDel = allReservations.filter(r => r.date === res.date && r.firstName === res.firstName);
            for (let item of toDel) await deleteDoc(doc(db, "reservations", item.id));
        }
    } else if (pin !== null) alert("Błędny PIN!");
}

onSnapshot(reservationsCol, (snap) => {
    allReservations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCalendar();
});

document.getElementById("reserveBtn").onclick = () => document.getElementById("bookingModal").classList.add("active");
document.getElementById("cancelModalBtn").onclick = () => document.getElementById("bookingModal").classList.remove("active");
document.getElementById("confirmBookingBtn").onclick = confirmBooking;
document.getElementById("closeSuccessBtn").onclick = () => document.getElementById("successModal").classList.remove("active");

renderCalendar();