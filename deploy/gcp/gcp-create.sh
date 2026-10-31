#!/usr/bin/env bash
# Tạo máy chủ Gen-Studio trên Google Cloud. © 2026 Gen Labs — All rights reserved.
# Chạy trong Cloud Shell (console.cloud.google.com → nút >_), đã chọn đúng project:
#   bash gcp-create.sh
# Chạy lại an toàn: phần nào đã có thì bỏ qua. Không tạo gì ngoài: 1 IP tĩnh, 1 firewall, 1 bucket sao lưu,
# 1 service account chỉ ghi/đọc bucket đó, 1 VM. Tiền trừ vào credit (~60 USD/tháng: e2-standard-2 ~50 + IP ~3,6 + ổ 50 GB ~5).
# VM là xưởng làm việc chính (Claude Code + Docker + bộ test) nên cần 8 GB RAM; đổi cỡ: GS_MACHINE=e2-medium, ổ: GS_DISK_GB=30.
set -euo pipefail

PROJECT="${GS_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GS_REGION:-us-west1}"
ZONE="${GS_ZONE:-us-west1-b}"
VM="${GS_VM:-gen-studio}"
TYPE="${GS_MACHINE:-e2-standard-2}"
DISK="${GS_DISK_GB:-50}"
BUCKET="gs://${PROJECT}-gs-backup"
SA="gs-backup@${PROJECT}.iam.gserviceaccount.com"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ -n "$PROJECT" ] || { echo "✗ Chưa chọn project — chạy: gcloud config set project <ID>" >&2; exit 1; }
for f in startup.sh setup-vm.sh backup-offsite.sh restore-test.sh restore-drill.sh alert.sh health-check.sh smoke.sh Caddyfile.tpl tailscale.sh drive-sync.sh drive-setup.sh tickets-sheet.py tickets-setup.sh; do
  [ -f "$HERE/$f" ] || { echo "✗ Thiếu $f cạnh script này" >&2; exit 1; }
done
FILES="startup-script=$HERE/startup.sh"
# khoá metadata chỉ nhận chữ/số/-/_ ⇒ đổi dấu chấm thành gạch (startup.sh đổi y hệt khi lấy về)
for f in setup-vm.sh backup-offsite.sh restore-test.sh restore-drill.sh alert.sh health-check.sh smoke.sh Caddyfile.tpl tailscale.sh drive-sync.sh drive-setup.sh tickets-sheet.py tickets-setup.sh; do FILES="$FILES,gs-file-${f//./-}=$HERE/$f"; done
echo "Project: $PROJECT · vùng $ZONE · máy $TYPE · ổ ${DISK} GB"

echo "› Bật API Compute Engine + Cloud Storage"
gcloud services enable compute.googleapis.com storage.googleapis.com --project "$PROJECT" >/dev/null

echo "› IP tĩnh"
gcloud compute addresses describe "$VM-ip" --region "$REGION" --project "$PROJECT" >/dev/null 2>&1 \
  || gcloud compute addresses create "$VM-ip" --region "$REGION" --project "$PROJECT" >/dev/null
IP="$(gcloud compute addresses describe "$VM-ip" --region "$REGION" --project "$PROJECT" --format='value(address)')"

echo "› Firewall: chỉ mở 80/443 cho máy gắn thẻ gs-web"
gcloud compute firewall-rules describe gs-web --project "$PROJECT" >/dev/null 2>&1 \
  || gcloud compute firewall-rules create gs-web --project "$PROJECT" --network default \
       --allow tcp:80,tcp:443 --target-tags gs-web --direction INGRESS >/dev/null

echo "› Bucket sao lưu $BUCKET (tự xoá bản cũ hơn 30 ngày)"
if ! gcloud storage buckets describe "$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "$BUCKET" --project "$PROJECT" --location "$REGION" --uniform-bucket-level-access >/dev/null
  printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}' > /tmp/gs-lifecycle.json
  gcloud storage buckets update "$BUCKET" --lifecycle-file=/tmp/gs-lifecycle.json >/dev/null
fi

echo "› Service account chỉ dùng bucket sao lưu"
gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1 \
  || gcloud iam service-accounts create gs-backup --project "$PROJECT" --display-name "Gen-Studio backup" >/dev/null
# chỉ tạo + đọc (khôi phục thử); không xoá/ghi đè — VM bị chiếm cũng không phá được bản sao lưu cũ. Xoá do lifecycle 30 ngày.
gcloud storage buckets remove-iam-policy-binding "$BUCKET" --member "serviceAccount:$SA" --role roles/storage.objectAdmin >/dev/null 2>&1 || true
# giữ tối thiểu 7 ngày: kể cả ai có quyền xoá cũng không xoá được bản sao lưu mới (khoá hẳn bằng --lock-retention-period khi đã ổn)
gcloud storage buckets update "$BUCKET" --retention-period=7d >/dev/null
for role in roles/storage.objectCreator roles/storage.objectViewer; do
  gcloud storage buckets add-iam-policy-binding "$BUCKET" --member "serviceAccount:$SA" --role "$role" >/dev/null
done

echo "› Máy chủ $VM"
if ! gcloud compute instances describe "$VM" --zone "$ZONE" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud compute instances create "$VM" --project "$PROJECT" --zone "$ZONE" --machine-type "$TYPE" \
    --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud \
    --boot-disk-size "${DISK}GB" --boot-disk-type pd-balanced \
    --address "$IP" --tags gs-web \
    --service-account "$SA" --scopes https://www.googleapis.com/auth/devstorage.read_write \
    --metadata "gs-bucket=$BUCKET" --metadata-from-file "$FILES" >/dev/null
fi

# máy đã có: cập nhật bộ script (lần khởi động sau tự lấy; chạy ngay bằng: sudo google_metadata_script_runner startup)
gcloud compute instances add-metadata "$VM" --zone "$ZONE" --project "$PROJECT" --metadata-from-file "$FILES" >/dev/null

echo "› Lịch chụp ảnh ổ hằng ngày (snapshot — đường lùi độc lập với sao lưu ứng dụng, giữ 7 ngày, ổ 50 GB ≈ <2 USD/tháng)"
gcloud compute resource-policies describe gs-daily --project "$PROJECT" --region "$REGION" >/dev/null 2>&1 \
  || gcloud compute resource-policies create snapshot-schedule gs-daily --project "$PROJECT" --region "$REGION" \
       --max-retention-days 7 --daily-schedule --start-time 20:00 --storage-location us >/dev/null
gcloud compute disks describe "$VM" --zone "$ZONE" --project "$PROJECT" --format='value(resourcePolicies)' 2>/dev/null | grep -q gs-daily \
  || gcloud compute disks add-resource-policies "$VM" --zone "$ZONE" --project "$PROJECT" --resource-policies gs-daily >/dev/null

HOST="$(echo "$IP" | tr . -).sslip.io"
UPTIME_HOST="${GS_UPTIME_HOST:-$HOST}"   # đổi sang tên miền riêng đã trỏ DNS (vd asset.genos.top) khi chạy lại: GS_UPTIME_HOST=asset.genos.top bash gcp-create.sh

echo "› Cảnh báo sống còn: uptime check + chính sách báo động (miễn phí trong hạn mức Cloud Monitoring)"
UPTIME_OK=1
if gcloud monitoring uptime list-configs --project "$PROJECT" --format='value(displayName)' 2>/dev/null | grep -qx gs-uptime; then
  :
else
  gcloud monitoring uptime create gs-uptime \
    --project "$PROJECT" \
    --resource-type=uptime-url \
    --resource-labels="host=$UPTIME_HOST" \
    --protocol=https \
    --path=/.well-known/oauth-authorization-server \
    --period=5 \
    >/dev/null 2>&1 || UPTIME_OK=0
fi
if [ "$UPTIME_OK" = 1 ]; then
  ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
  CHANNEL="$(gcloud alpha monitoring channels list --project "$PROJECT" --filter="labels.email_address=$ACCOUNT" --format='value(name)' 2>/dev/null | head -1)"
  if [ -z "$CHANNEL" ]; then
    CHANNEL="$(gcloud alpha monitoring channels create --project "$PROJECT" --display-name "gs-alert-email" \
      --type=email --channel-labels=email_address="$ACCOUNT" --format='value(name)' 2>/dev/null)" || UPTIME_OK=0
  fi
  echo "  ✓ uptime check gs-uptime: https://$UPTIME_HOST/.well-known/oauth-authorization-server (5 phút/lần)"
  if [ -n "$CHANNEL" ]; then
    VSTATUS="$(gcloud beta monitoring channels describe "$CHANNEL" --project "$PROJECT" --format='value(verificationStatus)' 2>/dev/null)"
    if [ -n "$VSTATUS" ] && [ "$VSTATUS" != "VERIFIED" ]; then
      echo "  ⚠ kênh email $ACCOUNT chưa xác minh (verificationStatus=$VSTATUS) — vào console.cloud.google.com/monitoring/alerting/notifications, bấm xác minh email (xem docs/OPS.md)"
    fi
    # REDUCE_COUNT_TRUE (không phải FALSE): đếm số lần check_passed=true trong cửa sổ — bắn cảnh báo khi số đó < 1
    # (tức TOÀN BỘ lần kiểm trong cửa sổ đều fail). Dùng REDUCE_COUNT_FALSE + "< 1" (bản cũ, SAI) sẽ bắn khi đang khoẻ
    # và im khi chết — ngược hoàn toàn. duration=300s: đợi 1 chu kỳ kiểm (5') mới báo, tránh báo giả vì 1 lần trễ mạng.
    # Policy cũ (nếu còn, có thể mang cấu hình sai) bị xoá rồi tạo lại — tránh 2 policy trùng tên chồng nhau.
    OLD="$(gcloud alpha monitoring policies list --project "$PROJECT" --filter='displayName="gs-uptime-down"' --format='value(name)' 2>/dev/null)"
    [ -n "$OLD" ] && echo "$OLD" | while read -r p; do [ -n "$p" ] && gcloud alpha monitoring policies delete "$p" --project "$PROJECT" --quiet >/dev/null 2>&1; done
    gcloud alpha monitoring policies create --project "$PROJECT" \
      --display-name "gs-uptime-down" --notification-channels="$CHANNEL" \
      --condition-display-name="gs-uptime check failing" \
      --condition-filter='metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND resource.type="uptime_url"' \
      --aggregation='{"alignmentPeriod":"300s","perSeriesAligner":"ALIGN_NEXT_OLDER","crossSeriesReducer":"REDUCE_COUNT_TRUE","groupByFields":["resource.label.host"]}' \
      --if='< 1' --duration=300s --trigger-count=1 --combiner=OR >/dev/null 2>&1 \
      && echo "  ✓ chính sách báo động gs-uptime-down → email $ACCOUNT (REDUCE_COUNT_TRUE, duration 300s)" \
      || echo "  ⚠ chưa tạo được chính sách báo động tự động — nối tay trong console (xem docs/OPS.md)"
  fi
else
  echo "  ⚠ gcloud CLI không tạo được uptime check/kênh báo động tự động — làm tay: console.cloud.google.com/monitoring/uptime (xem docs/OPS.md)"
fi

cat <<EOF

✓ Xong. IP: $IP
  Địa chỉ HTTPS (sau bước cài): https://$HOST
Bước tiếp (khoảng 3 phút sau để máy cài Docker xong):
  gcloud compute ssh $VM --zone $ZONE
  rồi trên máy chủ chạy:  sudo bash /opt/gs-deploy/setup-vm.sh
EOF
