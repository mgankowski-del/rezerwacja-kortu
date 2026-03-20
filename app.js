import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

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

// --- KONFIGURACJA APLIKACJI ---
const START_HOUR = 6;
const END_HOUR = 24;
const SLOT_DURATION_MINUTES = 30;
const STORAGE_KEY = 'tennis_reservations';

// Tuta wpisz swój tajny PIN administratora (może być dłuższy, np. 6 cyfr lub tekst)
const MASTER_PIN = "21892387"; 

let selectedSlots = [];

document.addEventListener('DOMContentLoaded', async () => {
    generateCalendar();
    setupEventListeners();
    await loadReservationsFromDB(); 
});

function generateCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendarEl.innerHTML = ''; 
    const today = new Date();

    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(today);
        currentDate.setDate(today.getDate() + i);

        const dayCol = document.createElement('div');
        dayCol.className = 'day-column';

        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        dayHeader.innerHTML = `<strong>${currentDate.toLocaleDateString('pl-PL', { weekday: 'short' })}</strong><br>${currentDate.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}`;
        dayCol.appendChild(dayHeader);

        for (let h = START_HOUR; h < END_HOUR; h++) {
            for (let m = 0; m < 60; m += SLOT_DURATION_MINUTES) {
                const slot = document.createElement('div');
                slot.className = 'time-slot';
                
                const timeString = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                slot.innerText = timeString;

                const yyyy = currentDate.getFullYear();
                const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
                const dd = String(currentDate.getDate()).padStart(2, '0');
                const fullDateTime = `${yyyy}-${mm}-${dd}T${timeString}`;
                
                slot.dataset.datetime = fullDateTime;
                slot.addEventListener('click', () => handleSlotSelection(slot));
                dayCol.appendChild(slot);
            }
        }
        calendarEl.appendChild(dayCol);
    }
}

function handleSlotSelection(slot) {
    if (slot.classList.contains('booked')) {
        const reservationId = slot.dataset.reservationId;
        if (reservationId) {
            handleCancelReservation(reservationId);
        }
        return;
    }

    const slotTime = new Date(slot.dataset.datetime).getTime();

    if (slot.classList.contains('selected')) {
        clearSelection();
        return;
    }

    if (selectedSlots.length > 0) {
        selectedSlots.sort((a, b) => a.time - b.time);
        const lastSlotTime = selectedSlots[selectedSlots.length - 1].time;
        const diff = slotTime - lastSlotTime;
        const THIRTY_MINS_MS = 30 * 60 * 1000;

        if (selectedSlots.length >= 4 || diff !== THIRTY_MINS_MS) {
            clearSelection();
        }
    }

    selectedSlots.push({ element: slot, time: slotTime });
    slot.classList.add('selected');
    document.getElementById('reserveBtn').style.display = selectedSlots.length > 0 ? 'block' : 'none';
}

function clearSelection() {
    selectedSlots.forEach(s => {
        s.element.classList.remove('selected');
        const timeText = s.element.dataset.datetime.split('T')[1];
        s.element.innerHTML = timeText;
    });
    selectedSlots = [];
    document.getElementById('reserveBtn').style.display = 'none';
}

async function handleCancelReservation(reservationId) {
    const localReservations = getLocalReservations();
    const localData = localReservations[reservationId];
    let pinToVerify = null;

    if (localData && localData.pin) {
        const confirmCancel = confirm("Wygląda na to, że to Twoja rezerwacja. Czy na pewno chcesz zwolnić ten termin?");
        if (!confirmCancel) return;
        pinToVerify = localData.pin;
    } else {
        const enteredPin = prompt("Ten termin jest już zajęty. Jeśli to Twoja rezerwacja (lub jesteś administratorem), podaj PIN, aby ją anulować:");
        if (enteredPin === null || enteredPin.trim() === "") return; 
        pinToVerify = enteredPin.trim();
    }

    try {
        const docRef = doc(db, "reservations", reservationId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const dbPin = docSnap.data().pin;
            
            // MAGIA ADMINISTRATORA: Akceptujemy PIN z bazy LUB nasz Master PIN
            if (dbPin === pinToVerify || pinToVerify === MASTER_PIN) {
                await deleteDoc(docRef);
                
                const bookedTimes = docSnap.data().bookedTimes || [];
                bookedTimes.forEach(timeStr => {
                    const slotEl = document.querySelector(`[data-datetime="${timeStr}"]`);
                    if (slotEl) {
                        slotEl.classList.remove('booked');
                        slotEl.title = "";
                        delete slotEl.dataset.reservationId;
                        const timeText = timeStr.split('T')[1];
                        slotEl.innerHTML = timeText; 
                    }
                });

                if (localData) {
                    delete localReservations[reservationId];
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(localReservations));
                }

                alert("Rezerwacja została pomyślnie anulowana. Kort jest znów wolny!");
            } else {
                alert("Błędny PIN! Odmowa dostępu.");
            }
        } else {
            alert("Nie znaleziono tej rezerwacji w bazie. Mogła zostać już usunięta.");
        }
    } catch (error) {
        console.error("Błąd podczas anulowania:", error);
        alert("Wystąpił problem z połączeniem. Spróbuj ponownie.");
    }
}

async function loadReservationsFromDB() {
    try {
        const querySnapshot = await getDocs(collection(db, "reservations"));
        querySnapshot.forEach((documentSnapshot) => {
            const data = documentSnapshot.data();
            const reservationId = documentSnapshot.id; 
            
            if(data.bookedTimes && Array.isArray(data.bookedTimes)) {
                data.bookedTimes.forEach(timeStr => {
                    const slotEl = document.querySelector(`[data-datetime="${timeStr}"]`);
                    if(slotEl) {
                        slotEl.classList.add('booked');
                        slotEl.classList.remove('selected'); 
                        slotEl.dataset.reservationId = reservationId; 
                        
                        const timeText = timeStr.split('T')[1];
                        const displayName = data.firstName ? data.firstName : (data.surname || 'Rezerwacja'); 
                        
                        slotEl.innerHTML = `<strong>${timeText}</strong><br><span style="font-size: 11px; line-height: 1.2; display: inline-block; margin-top: 4px;">${displayName}, ${data.address || ''}</span>`;
                        slotEl.title = `Zajęte przez: ${data.firstName || ''} ${data.surname || ''}`;
                    }
                });
            }
        });
    } catch (error) {
        console.error("Błąd pobierania rezerwacji:", error);
    }
}

function generateGoogleCalendarLink(start, end, pin, address) {
    const startStr = start.toISOString().replace(/-|:|\.\d+/g, '');
    const endStr = end.toISOString().replace(/-|:|\.\d+/g, '');
    const details = encodeURIComponent(`Rezerwacja kortu tenisowego.\nTwój PIN do anulacji: ${pin}`);
    const location = encodeURIComponent(address);
    const text = encodeURIComponent("Tenis - Rezerwacja Kortu");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${startStr}/${endStr}&details=${details}&location=${location}`;
}

function generateICalendarBlob(start, end, pin, address) {
    const startStr = start.toISOString().replace(/-|:|\.\d+/g, '');
    const endStr = end.toISOString().replace(/-|:|\.\d+/g, '');
    const icsContent = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${startStr}\nDTEND:${endStr}\nSUMMARY:Tenis - Rezerwacja Kortu\nDESCRIPTION:Rezerwacja kortu tenisowego.\\nTwój PIN do anulacji: ${pin}\nLOCATION:${address}\nEND:VEVENT\nEND:VCALENDAR`;
    return new Blob([icsContent], { type: 'text/calendar' });
}

function setupEventListeners() {
    const reserveBtn = document.getElementById('reserveBtn');
    const modal = document.getElementById('bookingModal');
    const closeModalBtn = document.getElementById('cancelModalBtn');
    const confirmBtn = document.getElementById('confirmBookingBtn');
    
    const successModal = document.getElementById('successModal');
    const closeSuccessBtn = document.getElementById('closeSuccessBtn');

    reserveBtn.addEventListener('click', () => {
        selectedSlots.sort((a, b) => a.time - b.time);
        const firstSlot = new Date(selectedSlots[0].time);
        const lastSlotEnd = new Date(selectedSlots[selectedSlots.length - 1].time + 30 * 60 * 1000);
        
        const dateStr = firstSlot.toLocaleDateString('pl-PL');
        const startStr = firstSlot.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
        const endStr = lastSlotEnd.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

        document.getElementById('selectedTimeInfo').innerText = `Data: ${dateStr}\nGodzina: ${startStr} - ${endStr}`;
        modal.classList.add('active');
    });

    closeModalBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    closeSuccessBtn.addEventListener('click', () => {
        successModal.classList.remove('active');
    });

    confirmBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const firstNameEl = document.getElementById('inputFirstName');
        const firstName = firstNameEl ? firstNameEl.value.trim() : '';
        const surname = document.getElementById('inputSurname').value.trim();
        const address = document.getElementById('inputAddress').value.trim();
        const pin = document.getElementById('inputPin').value.trim();

        if (!surname || !address || !pin) {
            alert("Proszę wypełnić wymagane pola (Nazwisko, Adres, PIN)!");
            return;
        }

        confirmBtn.innerText = "Zapisywanie...";
        confirmBtn.disabled = true;

        const bookedTimes = selectedSlots.map(s => s.element.dataset.datetime);

        try {
            const docRef = await addDoc(collection(db, "reservations"), {
                firstName: firstName,
                surname: surname,
                address: address,
                pin: pin,
                bookedTimes: bookedTimes,
                createdAt: new Date().toISOString()
            });

            saveReservationLocally(docRef.id, pin, bookedTimes);

            selectedSlots.sort((a, b) => a.time - b.time);
            const firstSlotTime = new Date(selectedSlots[0].time);
            const lastSlotTimeEnd = new Date(selectedSlots[selectedSlots.length - 1].time + 30 * 60 * 1000);

            selectedSlots.forEach(s => {
                s.element.classList.remove('selected');
                s.element.classList.add('booked');
                s.element.dataset.reservationId = docRef.id; 
                
                const timeText = s.element.dataset.datetime.split('T')[1];
                const displayName = firstName ? firstName : surname;
                s.element.innerHTML = `<strong>${timeText}</strong><br><span style="font-size: 11px; line-height: 1.2; display: inline-block; margin-top: 4px;">${displayName}, ${address}</span>`;
                s.element.title = `Zajęte przez: ${firstName} ${surname}`;
            });
            
            document.getElementById('successPin').innerText = pin;
            document.getElementById('btnGoogleCalendar').href = generateGoogleCalendarLink(firstSlotTime, lastSlotTimeEnd, pin, address);
            
            const icsBlob = generateICalendarBlob(firstSlotTime, lastSlotTimeEnd, pin, address);
            document.getElementById('btnIcsCalendar').href = URL.createObjectURL(icsBlob);
            document.getElementById('btnIcsCalendar').download = `Kort-Rezerwacja-${firstSlotTime.toLocaleDateString('pl-PL').replace(/\./g, '')}.ics`;

            modal.classList.remove('active');
            successModal.classList.add('active');
            
            selectedSlots = [];
            document.getElementById('reserveBtn').style.display = 'none';
            if(firstNameEl) firstNameEl.value = '';
            document.getElementById('inputSurname').value = '';
            document.getElementById('inputAddress').value = '';
            document.getElementById('inputPin').value = '';

        } catch (error) {
            console.error("Błąd zapisu:", error);
            alert("Wystąpił błąd podczas rezerwacji. Spróbuj ponownie.");
        } finally {
            confirmBtn.innerText = "Potwierdzam";
            confirmBtn.disabled = false;
        }
    });
}

function getLocalReservations() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
}

function saveReservationLocally(id, pin, times) {
    const reservations = getLocalReservations();
    reservations[id] = { pin: pin, times: times };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
}