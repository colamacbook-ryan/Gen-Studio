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
for f in startup.sh setup-vm.sh backup-offsite.sh restore-test.sh Caddyfile.tpl; do
  [ -f "$HERE/$f" ] || { echo "✗ Thiếu $f cạnh script này" >&2; exit 1; }
done
FILES="startup-script=$HERE/startup.sh"
# khoá metadata chỉ nhận chữ/số/-/_ ⇒ đổi dấu chấm thành gạch (startup.sh đổi y hệt khi lấy về)
for f in setup-vm.sh backup-offsite.sh restore-test.sh Caddyfile.tpl; do FILES="$FILES,gs-file-${f//./-}=$HERE/$f"; done
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

HOST="$(echo "$IP" | tr . -).sslip.io"
cat <<EOF

✓ Xong. IP: $IP
  Địa chỉ HTTPS (sau bước cài): https://$HOST
Bước tiếp (khoảng 3 phút sau để máy cài Docker xong):
  gcloud compute ssh $VM --zone $ZONE
  rồi trên máy chủ chạy:  sudo bash /opt/gs-deploy/setup-vm.sh
EOF
