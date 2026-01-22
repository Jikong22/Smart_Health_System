// ============================================================
// 1. Supabase 설정
// ============================================================
const SB_URL = 'https://akkdzfuauaeukqhdrydp.supabase.co'; 
const SB_KEY = 'sb_publishable_aVul9T_gOi8NDd70diW_gA_q0Yzwotl';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// ============================================================
// 2. 설정: 증상별 대기 시간 가중치
// ============================================================
const TIME_WEIGHTS = {
    '감기/발열': 5,
    '두통': 5,
    '복통': 10,
    '외상(상처)': 7,
    '기타': 3
};

// ============================================================
// 3. 화면 전환 함수
// ============================================================
function showView(viewId) {
    // 모든 뷰 숨기기
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
        view.classList.add('hidden'); 
    });

    // 선택한 뷰 보이기
    const nextView = document.getElementById(viewId);
    if (nextView) {
        nextView.classList.remove('hidden');
        setTimeout(() => nextView.classList.add('active'), 10);
        
        // 관리자 화면으로 갈 때 데이터 불러오기
        if (viewId === 'view-admin') fetchLogs();
    }
}

// ============================================================
// 4. 학생 접수 제출
// ============================================================
async function submitLog() {
    const stId = document.getElementById('stId').value;
    const stName = document.getElementById('stName').value;

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    setTimeout(() => { submitBtn.disabled = false; }, 3000);
    
    // 라디오 버튼 값 읽기
    const food = document.querySelector('input[name="food"]:checked')?.value === 'true';
    const allergy = document.querySelector('input[name="allergy"]:checked')?.value === 'true';
    
    const cat = document.getElementById('stCat').value;
    const detail = document.getElementById('stDetail').value;

    if (!stId || !stName) return alert("학번과 이름을 모두 입력해주세요.");

    const { error } = await _supabase.from('health_logs').insert([{
        student_id: stId, 
        name: stName, 
        eat: food, 
        allergy: allergy, 
        symptom_cat: cat, 
        symptom_detail: detail, 
        status: 'waiting'
    }]);

    if (error) {
        alert("오류 발생: " + error.message);
    } else {
        alert("접수 완료! 잠시 대기해주세요.");
        // 초기화 및 이동
        document.getElementById('stId').value = '';
        document.getElementById('stName').value = '';
        document.getElementById('stDetail').value = '';
        
        // [중요] 접수 직후 인원수 바로 갱신
        init(); 
        showView('view-login');
    }
}

// ============================================================
// 5. 관리자 목록 불러오기 (최적화 적용)
// ============================================================
async function fetchLogs() {
    // [최적화] 데이터가 너무 많아지면 느려지므로 최신 50개만 가져오도록 .limit(50) 추가
    const { data, error } = await _supabase.from('health_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
    
    if (error) return console.error("목록 로딩 실패:", error);

    const body = document.getElementById('log-body');
    body.innerHTML = data.map(log => {
        const timeStr = new Date(log.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        
        const eatDisplay = log.eat ? '<span style="color:blue; font-weight:bold;">O</span>' : '<span style="color:#ccc">X</span>';
        const allergyDisplay = log.allergy ? '<span style="color:red; font-weight:bold;">O</span>' : '<span style="color:#ccc">X</span>';

        return `
        <tr>
            <td>${timeStr}</td>
            <td>${log.student_id}</td>
            <td style="font-weight:bold;">${log.name}</td>
            <td>${eatDisplay}</td>
            <td>${allergyDisplay}</td>
            <td><span class="badge">${log.symptom_cat}</span></td>
            <td style="text-align: left; font-size: 0.9em; color:#555;">${log.symptom_detail || '-'}</td>
            <td>
                ${log.status === 'waiting' 
                    ? `<button class="btn-primary" style="padding:5px 10px; font-size:0.8rem;" onclick="completeLog(${log.id})">진료 대기중</button>` 
                    : '<span style="color:#34C759; font-weight:bold;">✅완료</span>'}
            </td>
        </tr>
    `}).join('');
}

// ============================================================
// 6. [수정됨] 완료 처리 (즉시 반영 로직 추가)
// ============================================================
async function completeLog(id) {
    if(!confirm("진료를 완료 처리하시겠습니까?")) return;
    
    // 1. DB 업데이트
    const { error } = await _supabase.from('health_logs').update({ status: 'done' }).eq('id', id);

    if (error) {
        alert("처리에 실패했습니다.");
    } else {
        // 2. [핵심] 성공했다면 강제로 화면 갱신 함수들을 호출합니다.
        // 실시간 기능에만 의존하지 않고 직접 호출하여 딜레이를 없앱니다.
        await fetchLogs(); // 리스트 갱신 (버튼을 '완료'로 바꿈)
        await init();      // 대기 인원수 갱신 (왼쪽 숫자 줄임)
    }
}

// ============================================================
// 7. 관리자 로그인
// ============================================================
async function adminLogin() {
    const pwInput = document.getElementById('pw');
    const inputPw = pwInput.value;
    const { data, error } = await _supabase.from("login").select("*").eq("id", 1).single();
    
    if (error || !data) {
        alert("관리자 정보를 불러올 수 없습니다.");
        return;
    }

    if (inputPw === data.password) {
        showView('view-admin');
    } else if (inputPw !== null) {
        alert("비밀번호가 틀렸습니다.");
    }
}

// ============================================================
// 8. 엑셀 다운로드
// ============================================================
async function downloadCSV() {
    const { data } = await _supabase.from('health_logs').select('*');
    // 한글 깨짐 방지용 BOM (\uFEFF)
    let csv = "\uFEFF시간,학번,이름,식사,알러지,증상,상세내용,상태\n";
    data.forEach(r => {
        csv += `${r.created_at},${r.student_id},${r.name},${r.eat},${r.allergy},${r.symptom_cat},${r.symptom_detail},${r.status}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `보건실_접수기록_${new Date().toLocaleDateString()}.csv`;
    a.click();
}

// ============================================================
// 9. 날씨 가져오기
// ============================================================
async function getWeather() {
    try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=37.4208&longitude=127.1265&current_weather=true');
        const data = await res.json();
        const temp = data.current_weather.temperature;
        
        document.getElementById('w-temp').innerText = `성남 ${temp}°C`;
        document.getElementById('w-icon').className = 'fa-solid fa-cloud-sun';
    } catch (e) {
        console.log("날씨 로딩 실패");
        document.getElementById('w-temp').innerText = "날씨 정보 없음";
    }
}

// ============================================================
// 10. 초기화 및 대기 인원 계산
// ============================================================
async function init() {
    // 'waiting' 상태인 사람만 가져옴
    const { data, count, error } = await _supabase
        .from('health_logs')
        .select('symptom_cat', { count: 'exact' })
        .eq('status', 'waiting');

    if (!error) {
        let totalMinutes = 0;
        if (data) {
            data.forEach(log => totalMinutes += (TIME_WEIGHTS[log.symptom_cat] || 5));
        }

        const infoDiv = document.getElementById('main-wait-info');
        if (count > 0) {
            infoDiv.innerHTML = `
                <h1 style="font-size: 80px; margin:10;" class="widget-number">${count}명</h1>
                <p style="font-size:1.3rem; margin-top:5px; color:#555;">(약 ${totalMinutes}분 대기)</p>
            `;
        } else {
            infoDiv.innerHTML = `
                <h1 class="widget-number" style="color:#000000; font-size:80px; margin:10;">0명</h1>
                <p style="font-size:1.3rem; margin-top:5px; color:#000000 ; font-weight:bold;">바로 진료 가능</p>
            `;
        }
    }
    
    // 관리자 화면이 켜져있으면 리스트도 같이 갱신
    if(document.getElementById('view-admin').classList.contains('active')){
        fetchLogs();
    }
}

// ============================================================
// 11. 실시간 감지 (보조 역할)
// ============================================================
// 다른 컴퓨터에서 접속했을 때 업데이트를 받기 위한 용도입니다.
_supabase
  .channel('public:health_logs')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'health_logs' }, (payload) => {
      console.log('DB 변경됨:', payload);
      init(); 
  })
  .subscribe();

// 페이지 로드 시 실행
window.addEventListener('DOMContentLoaded', () => {
    const loginView = document.getElementById('view-login');
    loginView.classList.remove('hidden');
    setTimeout(() => loginView.classList.add('active'), 10);
    
    getWeather();
    init();
});