const Peer = window.Peer;

//音声認識----------------------------------------------------
SpeechRecognition = webkitSpeechRecognition || SpeechRecognition;
let recognition = new SpeechRecognition();

recognition.lang = 'ja-JP';
recognition.interimResults = false; //これをtrueにすると発言が終わったタイミングではなく認識している途中で暫定の認識結果を得ることができる
//(上のやつfalseにすれば一言だけ認識できる？)
recognition.continuous = true; //これをtrueにすると発言が終わったタイミングで録音が自動的に終了せず，続けて認識する（１分くらい沈黙が続くと終了する）
//これの場合，認識された語はevent.results.[0][0].transcriptの次は[1][0]に入る
let finalTranscript = ''; // 確定した(黒の)認識結果

//Sky Way-----------------------------------------------------
(async function main() {

  //WebSocket部分
  var host = "ws://localhost:8080/pipe";
  var ws = new WebSocket(host); //接続するサーバを指定

  //相互注視検出用配列
  var local_face_LR = [0];
  var local_face_UD = [0];
  var remote_face_LR = [0];
  var remote_face_UD = [0];
  
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
  const messages = document.getElementById('js-messages');
  //const localText = document.getElementById('js-local-text'); //new
  //const sendTrigger = document.getElementById('js-send-trigger'); //new
  const stopCall = document.getElementById('stop-call');

  const resultDiv = document.querySelector('#result-div'); //音声認識
  const createPeer = document.getElementById('create-peer'); //PeerID生成

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
    .catch(console.error); //失敗したらコンソールエラーを投げる

  //ローカルで音声ビデオを読み込む．muted・srcObject・playInlineはセットらしい
  localVideo.muted = true; //ミュートにするか否か
  localVideo.srcObject = localStream; //メディアプレーヤで再生するときに.srcObjectに代入しないといけない
  localVideo.playsInline = true; //動画を貼ってあるサイズのまま再生する
  await localVideo.play().catch(console.error); //失敗したらコンソールエラー

  //PeerIDの取得（APIキーから自分のPeerIDを取得する）
  // const peer = (window.peer = new Peer({
  //   key: window.__SKYWAY_KEY__,
  //   debug: 3,
  // }));

  // これが電話をかけるトリガー--------------------------------------------------
  //これをクリックじゃなくせば電話のかけ方を変えられそう
  callTrigger.addEventListener('click', () => {
    // Note that you need to ensure the peer has connected to signaling server
    // before using methods of peer instance.
    localStream.getAudioTracks().forEach((track) => (track.enabled = true));
    if (!peer.open) {
      return;
    }

    //接続先のPeerIDを指定してmediaConnectionを作成
    //発信側
    const mediaConnection = peer.call(remoteId.value, localStream);

    //接続先Peerへのメディアチャンネル接続を管理するクラス
    mediaConnection.on('stream', async stream => {
      messages.textContent += `=== Call has been connected ===\n`;
      //リモートの相手をstreamして表示
      remoteVideo.srcObject = stream;
      remoteVideo.playsInline = true;
      await remoteVideo.play().catch(console.error);
    });

    //終了する時の処理
    mediaConnection.once('close', () => {
      remoteVideo.srcObject.getTracks().forEach(track => track.stop());
      remoteVideo.srcObject = null;
      messages.textContent += `=== Call has been disconnected ===\n`;
    });

    //電話を終わるトリガー
    closeTrigger.addEventListener('click', () => mediaConnection.close(true));
    //ミュート
    stopCall.addEventListener('click', () => {
      localStream.getAudioTracks().forEach((track) => (track.enabled = false));
    });
  });

  //チャット発信側--------------------------------------------------------
  // チャットを行うトリガー
  connectTrigger.addEventListener('click', () => {
    // Note that you need to ensure the peer has connected to signaling server
    // before using methods of peer instance.
    recognition.start();
    if (!peer.open) {
      return;
    }
    
    //接続先のPeerIDを指定してdataConnectionを作成
    const dataConnection = peer.connect(remoteId.value);

    //初めて繋がった時にメッセージ送る
    dataConnection.once('open', async () => {
      messages.textContent += `=== DataConnection has been opened ===\n`;
      //ws.sendで取得した値を動的に取得するためにwebsocketに送信するデータを格納する命令を出す
      message='dummy';
      ws.send(message);
    });


    //送られたデータを表示する処理
    dataConnection.on('data', data => { //on.'data'でデータが送られた時に自動的に発火する
    if(data[0] == 'v') { //声が送られた場合vを受け取る
    
      speechdata = [remote_face_LR[remote_face_LR.length - 1], remote_face_UD[remote_face_UD.length - 1], 0, 0, 'v'];
      messages.textContent += `voice recieve. face_dir_LR: ${speechdata[0]} face_dir_UD: ${speechdata[1]}\n`;

      ws.send(speechdata);

    }else {
      messages.textContent += `face_dir_LR: ${data[0]} face_dir_UD: ${data[1]} gazeLR: ${data[2]} gazeUD: ${data[3]}\n`; //$dataに送られてきたデータが入っている．messageに蓄積された内容が入っている

      remote_face_LR.push(data[0]);
      remote_face_UD.push(data[1]);

      if(remote_face_LR.length > 12) {
        remote_face_LR.shift();
        remote_face_UD.shift();
      }

      //相互注視判定
      var i = 1;
      while(i < 3) {
        if(remote_face_LR[remote_face_LR.length - i] < 10 && remote_face_LR[remote_face_LR.length - i] > -10 && local_face_LR[local_face_LR.length - i] < 10 && local_face_LR[local_face_LR.length - i] > -10) {
          i++;
        }else {
          break;
        }
      }
      if(i == 3) {
        console.log('Mutual Gaze is a sign of love!');
        data.push('g');
        localStream.getAudioTracks().forEach((track) => (track.enabled = true));
        //recognition.stop();
      }else {
        //localStream.getAudioTracks().forEach((track) => (track.enabled = false));
      }

      ws.send(data); //Pythonにリモートデータ送信
    }
  });

    //接続を終了する時の処理
    dataConnection.once('close', () => {
      messages.textContent += `=== DataConnection has been closed ===\n`;
    });

    //チャット終わるトリガー
    closeTrigger.addEventListener('click', () => dataConnection.close(), {
      once: true,
    });

    ws.onmessage = async function(x){
      var face_value = JSON.parse(x.data); //x.dataで送信された値の中身とってくる
      // var face_dir_LR = face_value[0];
      // var face_dir_UD = face_value[1];
      // var gaze_LR = face_value[2];
      // var gaze_UD = face_value[3];

      local_face_LR.push(face_value[0]);
      local_face_UD.push(face_value[1]);

      if(local_face_LR.length > 12) {
        local_face_LR.shift();
        local_face_UD.shift();
      }
    
      //視線情報をhtmlで表示するために#rcv要素にstring型で値を追加していく
      var string_txt = "face_dir_LR: " + face_value[0] + " face_dir_UD: " + face_value[1] + " gaze_LR: " + face_value[2] + " gaze_UD: " + face_value[3] + "<br>"
      $("#rcv").append(string_txt)      
      //ここでdataconnectionすることで撮った瞬間のデータを送る
      await dataConnection.send(face_value);
      
      // if(gaze_LR > 0) { //ここの条件を変更することで注視時の音声入力をする条件を変更できる
      //   recognition.start();
      // }else {
      //   recognition.stop();
      // }

    }

    //音声認識を受け取る
    recognition.onresult = (event) => {
      let interimTranscript = ''; // 暫定(灰色)の認識結果
      for (let i = event.resultIndex; i < event.results.length; i++) {
        let transcript = event.results[i][0].transcript; //event.result[i][0].transcriptに結果が入っている.
        if (event.results[i].isFinal) { //isFinalで終了したかどうかを判定
          finalTranscript += transcript;
          dataConnection.send("v");
        } else {
          interimTranscript = transcript;
        }
      }
      resultDiv.innerHTML = finalTranscript + '<i style="color:#ddd;">' + interimTranscript + '</i>';
      console.log(recognition);
    }

  });

  //こっから呼び出される方---------------------------------------------------------

  //正常に接続した時の処理
  createPeer.addEventListener('click', () => { 
    const peer_id = document.getElementById('peer-id');
    const peer = (window.peer = new Peer(peer_id.value, {
      key: window.__SKYWAY_KEY__,
      debug: 3,
    }));

    peer.once('open', id => (localId.textContent = id));

    //呼び出される側の電話の処理------------------------------------------------------
    //接続先Peerへのメディアチャンネル接続を管理するクラス
    peer.on('call', mediaConnection => {
      mediaConnection.answer(localStream); //localStreamで応答する
      mediaConnection.on('stream', async stream => {
        messages.textContent += `=== Call has been connected ===\n`;
        localStream.getAudioTracks().forEach((track) => (track.enabled = true));
        //リモートの相手を呼び出し先として表示
        remoteVideo.srcObject = stream;
        remoteVideo.playsInline = true;
        await remoteVideo.play().catch(console.error);
      });

      //終了する時の処理
      mediaConnection.once('close', () => {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
        messages.textContent += `=== Call has been disconnected ===\n`;
      });

      //電話を終わるトリガー
      closeTrigger.addEventListener('click', () => mediaConnection.close(true));

      //ミュート
      stopCall.addEventListener('click', () => {
      localStream.getAudioTracks().forEach((track) => (track.enabled = false));
    });

    });

    //チャット受信側---------------------------------------------------------------
    //チャットを接続する
    peer.on('connection', dataConnection => {
      dataConnection.once('open', async () => {
        messages.textContent += `=== DataConnection has been opened ===\n`;
        //ws.sendで取得した値を動的に取得するためにwebsocketに送信するデータを格納する命令を出す
        message='dummy';
        ws.send(message);
        //recognition.start();
      });

      dataConnection.on('data', data => {
        if(data[0] == 'v') {
          speechdata = [remote_face_LR[remote_face_LR.length - 1], remote_face_UD[remote_face_UD.length - 1], 0, 0, 'v'];
          messages.textContent += `voice recieve. face_dir_LR: ${speechdata[0]} face_dir_UD: ${speechdata[1]}\n`;

          ws.send(speechdata);
        }else {
          messages.textContent += `face_dir_LR: ${data[0]} face_dir_UD: ${data[1]} gazeLR: ${data[2]} gazeUD: ${data[3]}\n`;

          remote_face_LR.push(data[0]);
          remote_face_UD.push(data[1]);

          if(remote_face_LR.length > 12) {
            remote_face_LR.shift();
            remote_face_UD.shift();
          }

          //相互注視判定
          var i = 1;
          while(i < 3) {
            if(remote_face_LR[remote_face_LR.length - i] < 10 && remote_face_LR[remote_face_LR.length - i] > -10 && local_face_LR[local_face_LR.length - i] < 10 && local_face_LR[local_face_LR.length - i] > -10) {
              i++;
            }else {
              break;
            }
          }
          if(i == 3) {
            console.log('Mutual Gaze is a sign of love!');
            data.push('g');
            localStream.getAudioTracks().forEach((track) => (track.enabled = true));
            //recognition.stop();
          }else {
            //localStream.getAudioTracks().forEach((track) => (track.enabled = false));
          }

          ws.send(data); //pythonにリモートデータ送信
        }
      });

      //接続を終了する時の処理
      dataConnection.once('close', () => {
        messages.textContent += `=== DataConnection has been closed ===\n`;
      });

      ////チャット終わるトリガー
      closeTrigger.addEventListener('click', () => dataConnection.close(), {
        once: true,
      });

      ws.onmessage = async function(x){
        var face_value = JSON.parse(x.data); //x.dataで送信された値の中身とってくる
        // var face_dir_LR = face_value[0];
        // var face_dir_UD = face_value[1];
        // var gaze_LR = face_value[2];
        // var gaze_UD = face_value[3];

        if(local_face_LR.length > 12) {
          local_face_LR.shift();
          local_face_UD.shift();
        }
        
        local_face_LR.push(face_value[0]);
        local_face_UD.push(face_value[1]);
      
        //視線情報をhtmlで表示するために#rcv要素にstring型で値を追加していく
        var string_txt = "face_dir_LR: " + face_value[0] + " face_dir_UD: " + face_value[1] + " gaze_LR: " + face_value[2] + " gaze_UD: " + face_value[3] + "<br>"
        $("#rcv").append(string_txt)  
        await dataConnection.send(face_value);

        // if(gaze_LR > 0) { //ここの条件を変更することで注視時の音声入力をする条件を変更できる
        //   recognition.start();
        // }else {
        //   recognition.stop();
        // }
      }

      //音声認識を受け取る
      recognition.onresult = (event) => {
        let interimTranscript = ''; // 暫定(灰色)の認識結果
        for (let i = event.resultIndex; i < event.results.length; i++) {
          let transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) { //isFinalで終了したかどうかを判定
            finalTranscript += transcript;
            dataConnection.send("v");
          } else {
            interimTranscript = transcript;
          }
        }
        resultDiv.innerHTML = finalTranscript + '<i style="color:#ddd;">' + interimTranscript + '</i>';
      }

    });

    peer.on('error', console.error);
  });

})();