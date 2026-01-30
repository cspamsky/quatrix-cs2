# Quatrix – CS2 Server Manager Refactor Plan

Bu doküman, Quatrix projesinin **Docker kullanmadan**,  
**Linux üzerinde**, **tek CS2 core + çoklu server instance** mimarisine  
geçişi için hazırlanmış **tam kapsamlı refactor planıdır**.

Amaç: Quatrix’i hobi/prototype seviyesinden çıkarıp  
**host-seviyesi, güvenli, ölçeklenebilir ve sürdürülebilir** bir CS2 paneli haline getirmek.

---

## 🎯 TEMEL HEDEFLER

- CS2 oyun dosyaları **tek bir core dizininde**
- Her server **kendi cfg / log / map / data alanına sahip**
- SteamCMD **yalnızca core’u günceller**
- Panel → Node.js Daemon → child_process mimarisi
- Docker YOK
- Linux (Ubuntu / Debian odaklı)

---

## 🧠 MEVCUT PROBLEMLER (ÖZET)

- Core ve instance dosyaları karışık
- SteamCMD bazı durumlarda instance dizinine indiriyor
- Update sırasında server çalışabiliyor
- Map ve log çakışmaları oluşuyor
- Runtime state & crash yönetimi zayıf
- Güvenlik izolasyonu net değil

---

## 📁 HEDEF DOSYA SİSTEMİ MİMARİSİ

```text
/opt/quatrix
├─ core/
│  └─ cs2/
│     ├─ game/
│     ├─ engine/
│     ├─ bin/
│     ├─ cs2.sh
│     └─ steamclient.so
│
├─ instances/
│  └─ {id}/
│     ├─ cfg/
│     ├─ logs/
│     ├─ maps/
│     ├─ data/
│     ├─ game -> symlink
│     ├─ engine -> symlink
│     ├─ bin -> symlink
│     └─ cs2.sh -> symlink
```

📌 **Temel Kurallar**

1. `core/` dizini **salt-okunur**.
2. Instance’lar core’a **asla yazmaz**.
3. Yazılan her şey **instance dizinindedir**.

---

## 🟢 FAZ 1 – DOSYA SİSTEMİ REFACTOR (KRİTİK)

**Amaç**: Core ve instance ayrımını kesin ve geri dönülmez hale getirmek.

**Yapılacaklar:**

- [ ] `servers/` → `instances/` olarak yeniden adlandırılacak.
- [ ] SteamCMD `force_install_dir` sadece **core** dizini olacak.
- [ ] Instance oluşturulurken core dosyalarına **symlink** atılacak.

**Instance oluşturma (örnek kod):**

```typescript
import fs from "fs";
import path from "path";

const CORE = "/opt/quatrix/core/cs2";
const BASE = `/opt/quatrix/instances/${id}`;

fs.mkdirSync(`${BASE}/cfg`, { recursive: true });
fs.mkdirSync(`${BASE}/logs`, { recursive: true });
fs.mkdirSync(`${BASE}/maps`, { recursive: true });
fs.mkdirSync(`${BASE}/data`, { recursive: true });

["game", "engine", "bin", "cs2.sh"].forEach((item) => {
  fs.symlinkSync(path.join(CORE, item), path.join(BASE, item));
});
```

---

## 🟢 FAZ 2 – BACKEND SERVICE AYRIŞTIRMA

**Amaç**: Dağınık backend logic’i net sorumluluklara ayırmak.

**Önerilen servis yapısı:**

```text
backend/services/
├─ core.service.ts        # SteamCMD / CS2 update
├─ instance.service.ts    # instance create / delete
├─ runtime.service.ts     # start / stop / restart
├─ lock.service.ts        # update & runtime lock
```

### 🔒 LOCK MEKANİZMASI (ÇOK KRİTİK)

**Lock dosyaları:**

- `/opt/quatrix/core/.update.lock`
- `/opt/quatrix/instances/{id}/.lock`

**Kurallar:**

1. Update varken server **start ❌**
2. Server çalışıyorken **update ❌**
3. Aynı instance aynı anda iki kere başlatılamaz **❌**

Bu mekanizma data corruption riskini sıfırlar.

---

## 🟢 FAZ 3 – RUNTIME & STABILITY

### Server Başlatma

```typescript
spawn(
  "./cs2.sh",
  ["-game", "csgo", "-console", "+port", instance.port, "+map", instance.map],
  {
    cwd: `/opt/quatrix/instances/${instance.id}`,
    uid: CS2_UID,
    gid: CS2_GID,
  },
);
```

### PID & State Management

Her instance için runtime state tutulmalıdır:

```json
{
  "id": "uuid",
  "pid": 1234,
  "status": "starting" | "online" | "stopped" | "crashed",
  "port": 27015,
  "startedAt": "ISOString"
}
```

### Crash Detection

```typescript
proc.on("exit", (code) => {
  if (code !== 0) markCrashed(instance.id);
});
```

### Resource Limit (Önerilir)

```bash
systemd-run --scope \
  -p MemoryMax=6G \
  -p CPUQuota=200% \
  ./cs2.sh ...
```

### 🗺 MAP YÖNETİMİ (ÇOK KRİTİK)

CS2 map yolu: `game/csgo/maps`
Mapler core’da tutulmamalıdır.

**Çözüm:**

```bash
ln -s /opt/quatrix/instances/{id}/maps \
      /opt/quatrix/instances/{id}/game/csgo/maps
```

### 📄 LOG AYRIŞTIRMA

Launch parametreleri:

```bash
+sv_logfile 1
+sv_logsdir logs
```

Her server kendi log klasörüne yazar.

### 🔐 GÜVENLİK

- root ile çalıştırma ❌
- `quatrix` Linux kullanıcısı ✔
- `child_process` → uid / gid ile spawn
- Instance başına PID + lock dosyası

---

## 📋 REFACTOR CHECKLIST

- [ ] Core / instance ayrımı
- [ ] Symlink standardı
- [ ] SteamCMD tek noktada
- [ ] Update ↔ run lock
- [ ] Map izolasyonu
- [ ] Log izolasyonu
- [ ] Crash detection
- [ ] State management
- [ ] Resource limit

---

## 🚀 SONUÇ

Bu refactor tamamlandığında:

- Disk kullanımı **%60–80 azalır**.
- Update süreleri **saniyelere iner**.
- Aynı makinede **10–30 CS2 server stabil çalışır**.
- Quatrix, **profesyonel host panelleriyle** aynı mimariye ulaşır.
