/* ============================================================
   동탄반석교회 — 파일 업로드 공용 모듈 (Supabase Storage)
   window.ChurchUpload.upload(file, {folder, compress}) → { url, key }
   window.ChurchUpload.remove(key)
   window.ChurchUpload.compressImage(file) → File(압축본)
   ------------------------------------------------------------
   · 이미지는 업로드 전 자동 축소·압축(최대 변 1600px, JPEG 82%)
     — 휴대폰 사진 5MB 가 보통 200~400KB 로 줄어 저장 용량을 아낍니다.
   · 교적 사진·직인·앨범이 모두 이 모듈을 씁니다(운평 시스템과 같은 인터페이스).
   ============================================================ */
window.ChurchUpload = (function () {
  function base() { return (window.SUPABASE_URL || "").replace(/\/$/, ""); }
  function bucket() { return window.STORAGE_BUCKET || "church"; }
  function isReady() { return !!base() && !!window.SUPABASE_ANON_KEY; }

  function token() {
    try {
      var ref = base().split("//")[1].split(".")[0];
      var raw = localStorage.getItem("sb-" + ref + "-auth-token");
      if (!raw) return "";
      var obj = JSON.parse(raw);
      return obj.access_token || (obj.currentSession && obj.currentSession.access_token) || "";
    } catch (e) { return ""; }
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var u = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(u); resolve(img); };
      img.onerror = function (e) { URL.revokeObjectURL(u); reject(e); };
      img.src = u;
    });
  }

  // 이미지 자동 압축
  function compressImage(file, maxDim, quality) {
    maxDim = maxDim || 1600;
    quality = quality || 0.82;
    if (!file || !/^image\//.test(file.type)) return Promise.resolve(file);
    if (/gif|svg|x-icon/.test(file.type)) return Promise.resolve(file);   // GIF/SVG는 원본 유지
    return loadImage(file).then(function (img) {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (Math.max(w, h) > maxDim) {
        var s = maxDim / Math.max(w, h);
        w = Math.round(w * s); h = Math.round(h * s);
      }
      var canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);                   // 투명 PNG → 흰 배경
      ctx.drawImage(img, 0, 0, w, h);
      return new Promise(function (res) { canvas.toBlob(res, "image/jpeg", quality); }).then(function (blob) {
        if (!blob || blob.size >= file.size) return file;                 // 효과 없으면 원본
        var name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
      });
    }).catch(function () { return file; });                              // 압축 실패 시 원본
  }

  // 저장 경로: <folder>/<연-월>/<시각>-<임의문자>.<확장자> (한글 파일명은 안전하게 치환)
  function makeKey(folder, name) {
    var d = new Date();
    var ym = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
    var ext = (String(name || "").match(/\.([A-Za-z0-9]{1,6})$/) || [, "bin"])[1].toLowerCase();
    var rnd = Math.random().toString(36).slice(2, 8);
    return (folder || "uploads") + "/" + ym + "/" + d.getTime() + "-" + rnd + "." + ext;
  }

  function upload(file, opts) {
    opts = opts || {};
    if (!isReady()) return Promise.reject(new Error("저장소가 아직 설정되지 않았습니다(js/config.js)."));
    if (!token()) return Promise.reject(new Error("로그인이 필요합니다."));
    var pre = (opts.compress === false) ? Promise.resolve(file) : compressImage(file);
    return pre.then(function (f) {
      var key = makeKey(opts.folder, f.name);
      return fetch(base() + "/storage/v1/object/" + bucket() + "/" + key, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token(),
          apikey: window.SUPABASE_ANON_KEY,
          "Content-Type": f.type || "application/octet-stream",
          "x-upsert": "true"
        },
        body: f
      }).then(function (res) {
        return res.text().then(function (t) {
          var data = {}; try { data = t ? JSON.parse(t) : {}; } catch (e) {}
          if (!res.ok) throw new Error(data.message || data.error || ("업로드 실패 (" + res.status + ")"));
          return { url: base() + "/storage/v1/object/public/" + bucket() + "/" + key, key: key };
        });
      });
    });
  }

  function remove(key) {
    if (!isReady() || !key) return Promise.resolve(false);
    return fetch(base() + "/storage/v1/object/" + bucket() + "/" + key, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token(), apikey: window.SUPABASE_ANON_KEY }
    }).then(function (res) { return res.ok; }).catch(function () { return false; });
  }

  return { isReady: isReady, compressImage: compressImage, upload: upload, remove: remove };
})();
