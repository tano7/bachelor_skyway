const Peer = window.Peer;

//音声認識----------------------------------------------------
SpeechRecognition = webkitSpeechRecognition || SpeechRecognition;
let recognition = new SpeechRecognition();

recognition.lang = 'ja-JP';
recognition.interimResults = false; //これをtrueにすると発言が終わったタイミングではなく認識している途中で暫定の認識結果を得ることができる
recognition.continuous = false; //これをtrueにすると発言が終わったタイミングで録音が自動的に終了せず，続けて認識する（１分くらい沈黙が続くと終了する）
//これの場合，認識された語はevent.results.[0][0].transcriptの次は[1][0]に入る
let finalTranscript = ''; // 確定した(黒の)認識結果

//Sky Way-----------------------------------------------------
(async function main() {

  //WebSocket部分
  var host = "ws://localhost:9997";
  var ws = new WebSocket(host); //接続するサーバを指定

  // 集中度・音声通話判定用変数
  var local_posture = [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2];
  var local_face_LR = [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2];
  var local_face_UD = [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2];
  var remote_posture = [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2];
  var remote_face_LR = [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2];
  var remote_face_UD = [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2];

  //相互注視検出用配列
  // var local_face_LR = [0];
  // var local_face_UD = [0];
  // var remote_face_LR = [0];
  // var remote_face_UD = [0];
  var call_judge = 0;
  var call_judge_count;

  //時間記録用
  var last_time;
  var now_time;

  //通話判定用 0 or 1
  var local_callJudge;
  var remote_callJudge;
  
  //htmlにある要素をjsで使用するために紐付ける
  const localVideo = document.getElementById('js-local-stream');
  const localId = document.getElementById('js-local-id');
  const callTrigger = document.getElementById('js-call-trigger');
  const closeTrigger = document.getElementById('js-close-trigger');
  const remoteVideo = document.getElementById('js-remote-stream');
  const remoteId = document.getElementById('js-remote-id');
  const meta = document.getElementById('js-meta');
  const sdkSrc = document.querySelector('script[src*=skyway]');
  const connectTrigger = document.getElementById('js-connect-trigger');
  // const messages = document.getElementById('js-messages');
  const stopCall = document.getElementById('stop-call'); //通話接続しながらミュート
  const resultDiv = document.querySelector('#result-div'); //音声認識
  const createPeer = document.getElementById('create-peer'); //PeerID生成

  const posture1 = document.getElementById('posture1');
  const posture2 = document.getElementById('posture2');
  const posture3 = document.getElementById('posture3');

  const gaze1 = document.getElementById('gaze1');
  const gaze2 = document.getElementById('gaze2');

  var posture_value = 0;

  var gaze_value = 0;

  posture1.addEventListener('click', () => {
    posture_value = 1;
  });
  posture2.addEventListener('click', () => {
    posture_value = 2;
  });
  posture3.addEventListener('click', () => {
    posture_value = 3;
  });

  gaze1.addEventListener('click', () => {
    gaze_value = 1;
  });
  gaze2.addEventListener('click', () => {
    gaze_value = 2;
  });

  //とりあえず共通で書いておくやつ
  meta.innerText = `
    UA: ${navigator.userAgent}
    SDK: ${sdkSrc ? sdkSrc.src : 'unknown'}
  `.trim();

  //ここでビデオと音声の接続，オンオフを切り替えられる
  const localStream = await navigator.mediaDevices
    .getUserMedia({
      audio: true,
      video: false,
    })
    .catch(console.error);

  //ローカルで音声ビデオを読み込む．muted・srcObject・playInlineはセットらしい
  localVideo.muted = true; //ミュートにするか否か
  localVideo.srcObject = localStream; //メディアプレーヤで再生するときに.srcObjectに代入しないといけない
  localVideo.playsInline = true; //動画を貼ってあるサイズのまま再生する
  await localVideo.play().catch(console.error); //失敗したらコンソールエラー

  // 通話発信側------------------------------------------------------------------------
  callTrigger.addEventListener('click', () => {
    // Note that you need to ensure the peer has connected to signaling server
    // before using methods of peer instance.
    localStream.getAudioTracks().forEach((track) => (track.enabled = false));
    local_callJudge = 0;
    if (!peer.open) {
      return;
    }
    //接続先のPeerIDを指定してmediaConnectionを作成
    const mediaConnection = peer.call(remoteId.value, localStream);
    //接続先Peerへのメディアチャンネル接続を管理するクラス
    mediaConnection.on('stream', async stream => {
      // messages.textContent += `=== Call has been connected ===\n`;
      //リモートの相手をstreamして表示
      remoteVideo.srcObject = stream;
      remoteVideo.playsInline = true;
      await remoteVideo.play().catch(console.error);
    });
    //終了する時の処理
    mediaConnection.once('close', () => {
      remoteVideo.srcObject.getTracks().forEach(track => track.stop());
      remoteVideo.srcObject = null;
      // messages.textContent += `=== Call has been disconnected ===\n`;
    });
    //電話を終わるトリガー
    closeTrigger.addEventListener('click', () => mediaConnection.close(true));
    //ミュート
    stopCall.addEventListener('click', () => {
      localStream.getAudioTracks().forEach((track) => (track.enabled = false));
      local_callJudge = 0;
    });
  });

  //チャット発信側-----------------------------------------------------------------
  // チャットを行うトリガー
  connectTrigger.addEventListener('click', () => {
    // Note that you need to ensure the peer has connected to signaling server
    // before using methods of peer instance.
    // recognition.start();
    if (!peer.open) {
      return;
    }
    
    //接続先のPeerIDを指定してdataConnectionを作成
    const dataConnection = peer.connect(remoteId.value);

    //初めて繋がった時にメッセージ送る
    dataConnection.once('open', async () => {
      // messages.textContent += `=== DataConnection has been opened ===\n`;
      // recognition.start();
      message='2,2,1,0.';
      ws.send(message);
    });


    //送られたデータを表示する処理
    dataConnection.on('data', data => { //on.'data'でデータが送られた時に自動的に発火する
      // console.log("received:" + data);

      remote_posture.push(Number(data[1]));
      remote_face_LR.push(Number(data[4]));
      remote_face_UD.push(Number(data[7]));
      if(remote_posture.length > 20) {
        remote_posture.shift();
        remote_face_LR.shift();
        remote_face_UD.shift();
        // ws.send(data);
      }
      
      remote_call_count = 0;
      local_call_count = 0;

      for(let i = 10; i < 20; i++) {
        if(remote_face_LR[i] == 1) {
          remote_call_count += 1;
        }
        if(local_face_LR[i] == 1) {
          local_call_count += 1;
        }
      }

      if(call_judge != 2) {
        if(remote_call_count >= 9 && local_call_count >= 9) {
          call_judge = 2;
          localStream.getAudioTracks().forEach((track) => (track.enabled = true));
          last_time = Date.now();
          console.log("音声通話開始！")
        }else if(remote_call_count >= 9) {
          call_judge = 1;
          console.log("相手はこっちを見ているよ")
        }else {
          call_judge = 0;
          console.log("remote_call_count =" + remote_call_count)
        }
      }else if(call_judge == 2) {
        console.log("通話中だーー")
      }
      ws.send(remote_posture[19] + "," + remote_face_LR[19] + "," + remote_face_UD[19] + "," + call_judge + ".");
      now_time = Date.now();

      // 音声通話切断判定
      if(now_time - last_time > 5000) {
        localStream.getAudioTracks().forEach((track) => (track.enabled = false));
        console.log("音声通話ブチギレ！")
        call_judge = 0;
      }

  }
  );

    //接続を終了する時の処理
    dataConnection.once('close', () => {
      // messages.textContent += `=== DataConnection has been closed ===\n`;
    });

    //チャット終わるトリガー
    closeTrigger.addEventListener('click', () => dataConnection.close(), {
      once: true,
    });

    ws.onmessage = async function(message){
      // 出力areaにメッセージを表示する。
      // messageTextArea.value += "Recieve From Server => "+message.data+"\n";
      local_posture.push(posture_value);
      local_face_LR.push(gaze_value);
      local_face_UD.push(1);
      if(local_posture.length > 20) {
        local_posture.shift();
        local_face_LR.shift();
        local_face_UD.shift();
      };

      // await dataConnection.send(message.data);
      await dataConnection.send("[" + posture_value + ", " + gaze_value + ", 1]");
    };

    //音声認識を受け取る
    recognition.onresult = (event) => {
      let interimTranscript = ''; // 暫定(灰色)の認識結果
      for (let i = event.resultIndex; i < event.results.length; i++) {
        let transcript = event.results[i][0].transcript; //event.result[i][0].transcriptに結果が入っている.
        if (event.results[i].isFinal) { //isFinalで終了したかどうかを判定
          finalTranscript += transcript;
          if(local_callJudge == 0 && remote_callJudge == 0) { //音声通話が接続していない状態のみ呼びかけを送信する
            // dataConnection.send("v");
            // messages.textContent += `voice sent.\n`;
          }
          last_time = Date.now();
          console.log('voice recognition');
        } else {
          interimTranscript = transcript;
        }
      }
      //resultDiv.innerHTML = finalTranscript + '<i style="color:#ddd;">' + interimTranscript + '</i>';
    }
    recognition.onend = function(){
      recognition.start();
    }

  });

  //こっから呼び出される方---------------------------------------------------------

  //正常に接続した時の処理
  createPeer.addEventListener('click', () => { 
    console.log('peer');
    const peer_id = document.getElementById('peer-id');
    const peer = (window.peer = new Peer(peer_id.value, {
      key: window.__SKYWAY_KEY__,
      debug: 3,
    }));

    peer.once('open', id => (localId.textContent = id));

    //通話着信側------------------------------------------------------
    //接続先Peerへのメディアチャンネル接続を管理するクラス
    peer.on('call', mediaConnection => {
      mediaConnection.answer(localStream); //localStreamで応答する
      mediaConnection.on('stream', async stream => {
        // messages.textContent += `=== Call has been connected ===\n`;
        localStream.getAudioTracks().forEach((track) => (track.enabled = false));
        local_callJudge = 0;
        //リモートの相手を呼び出し先として表示
        remoteVideo.srcObject = stream;
        remoteVideo.playsInline = true;
        await remoteVideo.play().catch(console.error);
      });
      //終了する時の処理
      mediaConnection.once('close', () => {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
        // messages.textContent += `=== Call has been disconnected ===\n`;
      });
      //電話を終わるトリガー
      closeTrigger.addEventListener('click', () => mediaConnection.close(true));
      //ミュート
      stopCall.addEventListener('click', () => {
        localStream.getAudioTracks().forEach((track) => (track.enabled = false));
        local_callJudge = 0;
      });
    });

    //チャット受信側---------------------------------------------------------------
    //チャットを接続する
    peer.on('connection', dataConnection => {
      dataConnection.once('open', async () => {
        // messages.textContent += `=== DataConnection has been opened ===\n`;
        // recognition.start();
        message='2,2,1,0.';
        ws.send(message);
      });

      dataConnection.on('data', data => {
        // console.log("received:" + data);

        remote_posture.push(Number(data[1]));
        remote_face_LR.push(Number(data[4]));
        remote_face_UD.push(Number(data[7]));
        if(remote_posture.length > 20) {
          remote_posture.shift();
          remote_face_LR.shift();
          remote_face_UD.shift();
        }

        remote_call_count = 0;
        local_call_count = 0;

      for(let i = 10; i < 20; i++) {
        if(remote_face_LR[i] == 1) {
          remote_call_count += 1;
        }
        if(local_face_LR[i] == 1) {
          local_call_count += 1;
        }
      }

      if(call_judge != 2) {
        if(remote_call_count >= 9 && local_call_count >= 9) {
          call_judge = 2;
          localStream.getAudioTracks().forEach((track) => (track.enabled = true));
          last_time = Date.now();
          console.log("音声通話開始！")
        }else if(remote_call_count >= 9) {
          call_judge = 1;
          console.log("相手はこっちを見ているよ");
        }else {
          call_judge = 0;
          console.log("remote_call_count =" + remote_call_count)
        }
      }else if(call_judge == 2) {
        console.log("通話中だーー")
      }
  
        ws.send(remote_posture[19] + "," + remote_face_LR[19] + "," + remote_face_UD[19] + "," + call_judge + ".");  
        now_time = Date.now();

        if(now_time - last_time > 5000) {
          localStream.getAudioTracks().forEach((track) => (track.enabled = false));
          console.log("音声通話ブチギレ！")   
          call_judge = 0;
        }
      });

      //接続を終了する時の処理
      dataConnection.once('close', () => {
        // messages.textContent += `=== DataConnection has been closed ===\n`;
      });

      ////チャット終わるトリガー
      closeTrigger.addEventListener('click', () => dataConnection.close(), {
        once: true,
      });

      ws.onmessage = async function(message){
        // 出力areaにメッセージを表示する。
        // messageTextArea.value += "Recieve From Server => "+message.data+"\n";
        local_posture.push(posture_value);
        local_face_LR.push(gaze_value);
        local_face_UD.push(1);
        if(local_posture.length > 20) {
          local_posture.shift();
          local_face_LR.shift();
          local_face_UD.shift();
        };

      // await dataConnection.send(message.data);
        await dataConnection.send("[" + posture_value + ", " + gaze_value + ", 1]");
      };

      //音声認識を受け取る
      recognition.onresult = (event) => {
        let interimTranscript = ''; // 暫定(灰色)の認識結果
        for (let i = event.resultIndex; i < event.results.length; i++) {
          let transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) { //isFinalで終了したかどうかを判定
            finalTranscript += transcript;
            if(local_callJudge == 0 && remote_callJudge == 0) {
              // dataConnection.send("v");
              // messages.textContent += `voice sent.\n`;
            }
            last_time = Date.now();
            //recogtnition.stop();
            console.log('voice recognition');
          } else {
            interimTranscript = transcript;
          }
        }
        //resultDiv.innerHTML = finalTranscript + '<i style="color:#ddd;">' + interimTranscript + '</i>';
      }
      recognition.onend = function(){
        recognition.start();
      }
    });

    peer.on('error', console.error);
  });

})();