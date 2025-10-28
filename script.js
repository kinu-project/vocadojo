import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, collection, getDocs, query, where, doc, updateDoc, writeBatch, setDoc, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCMxZjJ0tqFsHUEjgZ8pxrMzNHy9th7ta8",
    authDomain: "voca-dojo.firebaseapp.com",
    projectId: "voca-dojo",
    storageBucket: "voca-dojo.firebasestorage.app",
    messagingSenderId: "909375960429",
    appId: "1:909375960429:web:8b920d417301b339c05664",
    measurementId: "G-CYJLLF5NSM"
};

const ADMIN_UID = "pHf4wIs5iiccSyuRm4DKvbRqrz73";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let isRegisterMode = false;
let currentUser = null;
let songsData = [];
const QUIZ_SET_COUNT = 5;
const QUIZ_TIME_SECONDS = 10;
const BASE_SCORE_PER_QUESTION = 100;
const SPEED_BONUS_PER_SECOND = 10;
let quizSession = {
    currentQuestion: 0,
    totalScore: 0,
    totalTime: 0,
    questions: []
};
let player;
let currentQuiz = {};
let timerInterval;
let quizStartTime;

const isAdmin = () => currentUser && currentUser.uid === ADMIN_UID;

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateUIForAuthState();
    
    displaySongCount().then(() => {
        fetchRankings();
    });

    if (currentUser) {
        if (document.getElementById('admin-link')) document.getElementById('admin-link').classList.toggle('hidden', !isAdmin());
        if (document.getElementById('auth-form-section')) document.getElementById('auth-form-section').classList.add('hidden');
    }
    
    if (document.title.includes('管理者パネル')) {
        if (currentUser && isAdmin()) {
            if (document.getElementById('admin-welcome')) document.getElementById('admin-welcome').textContent = `管理者としてログイン中: ${currentUser.email}`;
            if (document.getElementById('pending-submissions-section')) document.getElementById('pending-submissions-section').classList.remove('hidden');
            loadPendingSubmissions();
        } else {
            if (document.getElementById('admin-welcome')) document.getElementById('admin-welcome').textContent = 'アクセス拒否';
            if (document.getElementById('auth-warning')) document.getElementById('auth-warning').textContent = '管理者権限がありません。ログインし直してください。';
        }
    }
});

function updateUIForAuthState() {
    const welcomeMessage = document.getElementById('welcome-message');
    const authButton = document.getElementById('auth-button');
    const userDashboard = document.getElementById('user-dashboard');

    if (welcomeMessage) {
        if (currentUser) {
            welcomeMessage.textContent = `ようこそ、${currentUser.email} さん！`;
            if (authButton) authButton.textContent = 'ログアウト';
            if (userDashboard) userDashboard.classList.remove('hidden');
        } else {
            welcomeMessage.textContent = 'ログインしていません。';
            if (authButton) authButton.textContent = 'ログイン / 新規登録';
            if (userDashboard) userDashboard.classList.add('hidden');
        }
    }
}

if (document.getElementById('auth-form')) {
    document.getElementById('auth-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;

        try {
            if (isRegisterMode) {
                await createUserWithEmailAndPassword(auth, email, password);
                alert('新規登録が完了しました！');
            } else {
                await signInWithEmailAndPassword(auth, email, password);
                alert('ログインしました！');
            }
            document.getElementById('auth-form-section').classList.add('hidden');
        } catch (error) {
            alert(`認証エラー: ${error.message}`);
        }
    });
}

if (document.getElementById('toggle-register-btn')) {
    document.getElementById('toggle-register-btn').addEventListener('click', () => {
        isRegisterMode = !isRegisterMode;
        const submitBtn = document.getElementById('auth-submit-btn');
        submitBtn.textContent = isRegisterMode ? '新規登録' : 'ログイン';
        document.getElementById('toggle-register-btn').textContent = isRegisterMode ? 'ログインに切り替え' : '新規登録に切り替え';
    });
}

if (document.getElementById('auth-button')) {
    document.getElementById('auth-button').addEventListener('click', () => {
        if (currentUser) {
            signOut(auth).then(() => {
                alert('ログアウトしました。');
                if (document.getElementById('auth-form-section')) document.getElementById('auth-form-section').classList.remove('hidden');
            }).catch((error) => {
                console.error('ログアウトエラー:', error);
            });
        } else {
            if (document.getElementById('auth-form-section')) document.getElementById('auth-form-section').classList.toggle('hidden');
        }
    });
}

async function displaySongCount() {
    try {
        const songsRef = collection(db, "songs");
        const snapshot = await getDocs(songsRef);
        songsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (document.getElementById('song-count-display')) document.getElementById('song-count-display').textContent = songsData.length;
    } catch (error) {
        console.error("曲数の取得中にエラーが発生しました:", error);
    }
}

if (document.getElementById('submission-form')) {
    document.getElementById('submission-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) {
            alert("曲の投稿にはログインが必要です。");
            return;
        }

        const url = document.getElementById('submission-url').value;
        const title = document.getElementById('submission-title').value;
        const messageDisplay = document.getElementById('submission-message');

        try {
            await setDoc(doc(collection(db, "submissions")), {
                youtube_url: url,
                title: title,
                submitter_uid: currentUser.uid,
                status: "pending",
                submittedAt: new Date()
            });
            messageDisplay.textContent = '曲が投稿されました！管理者の承認をお待ちください。';
            document.getElementById('submission-form').reset();
        } catch (error) {
            messageDisplay.textContent = `投稿エラー: ${error.message}`;
            console.error("投稿エラー:", error);
        }
    });
}

async function fetchRankings() {
    const rankingsRef = collection(db, "rankings");
    const q = query(rankingsRef, orderBy("score", "desc"), orderBy("timeTaken", "asc"), limit(10));
    const snapshot = await getDocs(q);
    const rankingList = document.getElementById('ranking-list');
    if (!rankingList) return;
    
    rankingList.innerHTML = '';

    snapshot.forEach((doc, index) => {
        const rank = doc.data();
        const listItem = document.createElement('li');
        const timeFormatted = rank.timeTaken ? rank.timeTaken.toFixed(2) : '---';
        
        listItem.innerHTML = `
            <strong>${index + 1}位</strong>: スコア ${rank.score} 点 / タイム ${timeFormatted} 秒 (ユーザー: ${rank.username || '匿名'})
        `;
        rankingList.appendChild(listItem);
    });
    
    if (snapshot.empty) {
        rankingList.innerHTML = '<li>まだ誰も挑戦していません。最初のチャレンジャーになろう！</li>';
    }
}

async function saveRanking(score, timeTaken) {
    if (!currentUser) {
        alert("ランキングに記録するにはログインが必要です。");
        return;
    }

    try {
        await setDoc(doc(collection(db, "rankings")), {
            user_id: currentUser.uid,
            username: currentUser.email.split('@')[0],
            score: score,
            timeTaken: timeTaken,
            timestamp: new Date()
        });
        alert(`ランキングに記録しました！スコア: ${score} 点、タイム: ${timeTaken.toFixed(2)} 秒`);
        fetchRankings();
    } catch (error) {
        console.error("ランキング保存エラー:", error);
        alert("ランキングの保存に失敗しました。");
    }
}

// ----------------------------------------------------
// YouTube Player ポーリング/初期化ロジック
// ----------------------------------------------------

function initializeYoutubePlayer() {
    if (typeof YT === 'undefined' || !document.getElementById('player')) {
        return false;
    }

    if (!player) {
        player = new YT.Player('player', {
            height: '0',
            width: '0',
            // 【修正】ホストを通常版に戻し、オリジンをハードコード
            host: 'https://www.youtube.com',
            playerVars: { 
                'controls': 0,
                'disablekb': 1,
                'rel': 0,
                'modestbranding': 1,
                // GitHub Pagesのホスト名に置き換え
                'origin': 'https://kinu-project.github.io' 
            },
            events: { 
                'onReady': onPlayerReady,
                'onError': onPlayerError
            }
        });
    }
    return true;
}

function onPlayerReady(event) {
    if (document.getElementById('start-quiz-btn')) document.getElementById('start-quiz-btn').disabled = false;
}

function onPlayerError(event) {
    console.error("YouTube Player Error:", event);
    alert("YouTubeプレイヤーの読み込みに失敗しました。この動画は再生できません。");
    if (document.getElementById('start-quiz-btn')) document.getElementById('start-quiz-btn').disabled = true;
}

function loadYoutubeAPI() {
    if (document.getElementById('youtube-api-script')) return;

    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    tag.id = 'youtube-api-script';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    let attempts = 0;
    const interval = setInterval(() => {
        if (initializeYoutubePlayer()) {
            clearInterval(interval);
        } else if (attempts++ > 100) {
            clearInterval(interval);
            console.error("YouTube APIロード失敗、またはプレイヤー要素が見つかりません。");
            alert("YouTubeプレイヤーの準備に失敗しました。サイトをリロードしてください。");
            if (document.getElementById('start-quiz-btn')) document.getElementById('start-quiz-btn').disabled = true;
        }
    }, 100);
}
// ----------------------------------------------------

function extractYouTubeId(url) {
    const regex = /(?:v=|\/embed\/|\/v\/|\/youtu\.be\/|\/watch\?v=|\/embed\?v=)([^#\&\?]*)/;
    const match = url.match(regex);
    return (match && match[1].length === 11) ? match[1] : null;
}

if (document.getElementById('start-quiz-btn')) {
    document.getElementById('start-quiz-btn').addEventListener('click', startQuizSession);
}

function startQuizSession() {
    if (!player || typeof player.loadVideoById !== 'function') {
        alert("YouTubeプレイヤーの準備が完了していません。数秒待ってから再度お試しください。");
        return;
    }

    if (songsData.length < QUIZ_SET_COUNT) {
        alert(`クイズを開始するには、最低${QUIZ_SET_COUNT}曲の登録が必要です。現在 ${songsData.length} 曲。`);
        return;
    }

    quizSession = {
        currentQuestion: 0,
        totalScore: 0,
        totalTime: 0,
        questions: []
    };
    
    let availableSongs = [...songsData];
    for (let i = 0; i < QUIZ_SET_COUNT; i++) {
        const randomIndex = Math.floor(Math.random() * availableSongs.length);
        quizSession.questions.push(availableSongs[randomIndex]);
        availableSongs.splice(randomIndex, 1);
    }

    if (document.getElementById('quiz-section')) document.getElementById('quiz-section').classList.remove('hidden');
    if (document.getElementById('start-quiz-btn')) document.getElementById('start-quiz-btn').classList.add('hidden');
    
    startNextQuiz();
}

function startNextQuiz() {
    if (quizSession.currentQuestion >= QUIZ_SET_COUNT) {
        endQuizSession();
        return;
    }

    const currentQuestionIndex = quizSession.currentQuestion;
    const correctSong = quizSession.questions[currentQuestionIndex];

    if (document.getElementById('quiz-title')) document.getElementById('quiz-title').textContent = `イントロクイズに挑戦！ (第 ${currentQuestionIndex + 1} 問 / 全 ${QUIZ_SET_COUNT} 問)`;
    if (document.getElementById('next-quiz-btn')) document.getElementById('next-quiz-btn').classList.add('hidden');
    if (document.getElementById('quiz-message')) document.getElementById('quiz-message').textContent = '';
    
    let choices = [correctSong.title];
    
    const allTitles = songsData.map(song => song.title);
    const possibleChoices = allTitles.filter(title => title !== correctSong.title);
    
    let tempArray = [...possibleChoices];
    for (let i = 0; i < 4 && tempArray.length > 0; i++) {
        const randomIndex = Math.floor(Math.random() * tempArray.length);
        choices.push(tempArray[randomIndex]);
        tempArray.splice(randomIndex, 1);
    }
    choices.sort(() => Math.random() - 0.5);

    currentQuiz = {
        correctTitle: correctSong.title,
        choices: choices,
        hasAnswered: false,
        timer: QUIZ_TIME_SECONDS
    };

    const choiceButtons = document.querySelectorAll('.choice-btn');
    choiceButtons.forEach((btn, index) => {
        btn.textContent = choices[index];
        btn.disabled = false;
        btn.style.borderColor = 'var(--color-neon-primary)';
        btn.style.boxShadow = '0 0 5px var(--color-accent-shadow)';
        btn.onclick = () => handleAnswer(btn.textContent === correctSong.title, performance.now());
    });
    
    const videoId = extractYouTubeId(correctSong.youtube_id);
    if (!player) return;
    
    // 再生ブロック回避ロジック: play/pauseを挟む
    player.playVideo();
    player.pauseVideo();
    
    player.loadVideoById({ 'videoId': videoId, 'startSeconds': 0 });
    
    quizStartTime = performance.now();
    startTimer();
}

function startTimer() {
    let timerDisplay = document.getElementById('timer-display');
    if (!timerDisplay) return;
    
    timerDisplay.textContent = QUIZ_TIME_SECONDS.toFixed(1);
    
    let timeRemaining = QUIZ_TIME_SECONDS;

    timerInterval = setInterval(() => {
        timeRemaining -= 0.1;
        timerDisplay.textContent = timeRemaining.toFixed(1);

        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            if (player) player.stopVideo();
            handleAnswer(false, performance.now(), true);
        }
    }, 100);
}

function calculateScore(timeElapsed) {
    const score = BASE_SCORE_PER_QUESTION;
    const bonusTime = QUIZ_TIME_SECONDS - timeElapsed;
    const speedBonus = Math.max(0, Math.floor(bonusTime * SPEED_BONUS_PER_SECOND));
    return score + speedBonus;
}

function handleAnswer(isCorrect, answerTime, isTimeout = false) {
    if (currentQuiz.hasAnswered) return;

    clearInterval(timerInterval);
    if (player) player.stopVideo();
    currentQuiz.hasAnswered = true;

    const timeElapsed = (answerTime - quizStartTime) / 1000;
    const messageDisplay = document.getElementById('quiz-message');
    const nextBtn = document.getElementById('next-quiz-btn');
    const correctTitle = currentQuiz.correctTitle;
    let scoreEarned = 0;

    if (!isTimeout) {
        quizSession.totalTime += timeElapsed;
    } else {
        quizSession.totalTime += QUIZ_TIME_SECONDS;
    }
    
    if (isCorrect) {
        scoreEarned = calculateScore(timeElapsed);
        quizSession.totalScore += scoreEarned;
        if (messageDisplay) messageDisplay.textContent = `正解！+${scoreEarned}点獲得。タイム: ${timeElapsed.toFixed(2)}秒`;
    } else if (isTimeout) {
        if (messageDisplay) messageDisplay.textContent = `時間切れ！正解は「${correctTitle}」でした。スコア変動なし。`;
    } else {
        if (messageDisplay) messageDisplay.textContent = `不正解...。正解は「${correctTitle}」でした。スコア変動なし。`;
    }

    document.querySelectorAll('.choice-btn').forEach(btn => {
        btn.disabled = true;
        if (btn.textContent === correctTitle) {
            btn.style.borderColor = 'var(--color-neon-secondary)';
            btn.style.boxShadow = '0 0 15px var(--color-neon-secondary)';
        }
    });

    quizSession.currentQuestion++;
    if (nextBtn) {
        nextBtn.textContent = quizSession.currentQuestion >= QUIZ_SET_COUNT ? '結果発表' : '次の問題へ';
        nextBtn.classList.remove('hidden');
    }
}

function endQuizSession() {
    const finalScore = quizSession.totalScore;
    const finalTime = quizSession.totalTime;
    
    alert(`クイズ終了！\n最終スコア: ${finalScore}点\n合計タイム: ${finalTime.toFixed(2)}秒`);
    
    if (document.getElementById('quiz-section')) document.getElementById('quiz-section').classList.add('hidden');
    if (document.getElementById('start-quiz-btn')) document.getElementById('start-quiz-btn').classList.remove('hidden');
    
    if (currentUser) {
        saveRanking(finalScore, finalTime);
    } else {
        alert("ログインすると、このスコアをランキングに記録できます！");
    }
}

if (document.getElementById('next-quiz-btn')) {
    document.getElementById('next-quiz-btn').addEventListener('click', startNextQuiz);
}

window.loadPendingSubmissions = async function() {
    if (!isAdmin()) {
        const submissionList = document.getElementById('submission-list');
        if (submissionList) submissionList.innerHTML = '<li>管理者権限が確認できません。</li>';
        return;
    }
    
    const submissionsRef = collection(db, "submissions");
    const q = query(submissionsRef, where("status", "==", "pending"));
    const submissionList = document.getElementById('submission-list');
    if (!submissionList) return;
    
    submissionList.innerHTML = '<li>審査待ち投稿データをロード中...</li>';

    try {
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            submissionList.innerHTML = '<li>現在、審査待ちの投稿はありません。</li>';
            return;
        }

        submissionList.innerHTML = '';
        snapshot.forEach(doc => {
            const submission = doc.data();
            const docId = doc.id;
            const listItem = document.createElement('li');
            
            listItem.innerHTML = `
                曲名: <strong>${submission.title}</strong><br>
                URL: <a href="${submission.youtube_url}" target="_blank">視聴</a><br>
                投稿者: ${submission.submitter_uid.substring(0, 8)}...
                <div style="margin-top: 5px;">
                    <button class="action-btn" onclick="approveSubmissionHandler('${docId}', '${submission.youtube_url}', '${submission.title}')">承認</button>
                    <button class="action-btn reject-btn" onclick="rejectSubmission('${docId}')">拒否</button>
                </div>
                <hr>
            `;
            submissionList.appendChild(listItem);
        });

    } catch (error) {
        console.error("審査待ち投稿の取得エラー:", error);
        submissionList.innerHTML = '<li>データの取得中にエラーが発生しました。コンソールを確認してください。</li>';
    }
}

window.approveSubmissionHandler = function(submissionDocId, youtubeUrl, title) {
    if (!isAdmin() || !confirm(`曲名「${title}」を承認して、クイズに追加しますか？`)) return;
    
    approveSubmission(submissionDocId, youtubeUrl, title);
}

async function approveSubmission(submissionDocId, youtubeUrl, title) {
    if (!isAdmin()) return;

    const batch = writeBatch(db);
    const submissionRef = doc(db, "submissions", submissionDocId);
    batch.update(submissionRef, { status: "approved", approvedAt: new Date() });

    const songsRef = collection(db, "songs");
    const youtubeId = extractYouTubeId(youtubeUrl); 
    
    batch.set(doc(songsRef), {
        youtube_id: youtubeId,
        title: title
    });

    try {
        await batch.commit();
        alert(`曲「${title}」を承認し、songsに追加しました。`);
        loadPendingSubmissions();
        displaySongCount();
    } catch (e) {
        console.error("承認処理に失敗しました:", e);
        alert("承認処理に失敗しました。コンソールを確認してください。");
    }
}

window.rejectSubmission = async function(submissionDocId) {
    if (!isAdmin() || !confirm("本当にこの投稿を拒否しますか？")) return;

    try {
        const submissionRef = doc(db, "submissions", submissionDocId);
        await updateDoc(submissionRef, { status: "rejected", rejectedAt: new Date() });
        
        alert(`投稿ID: ${submissionDocId} を拒否しました。`);
        loadPendingSubmissions();
    } catch (e) {
        console.error("拒否処理に失敗しました:", e);
        alert("拒否処理に失敗しました。コンソールを確認してください。");
    }
}

if (document.getElementById('open-submission-form-btn')) {
    document.getElementById('open-submission-form-btn').addEventListener('click', () => {
        if (document.getElementById('submission-form-section')) document.getElementById('submission-form-section').classList.toggle('hidden');
    });
}

window.addEventListener('load', () => {
    loadYoutubeAPI();
});