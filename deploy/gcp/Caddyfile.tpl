# Caddy trước Gen-Studio trên GCP. © 2026 Gen Labs — All rights reserved.
# setup-vm.sh thay __HOST__, __PORT__, __HASH__. Ra Internet tự do chỉ có MCP + OAuth + well-known;
# Bỏ CF-Connecting-IP/X-Real-IP do client tự đặt (studio tin chúng khi GS_TRUST_PROXY=1); X-Forwarded-For do Caddy tự ghi.
# mọi đường khác (UI chủ xưởng, /api, /media) phải qua mật khẩu cổng rồi mới tới đăng nhập chủ xưởng.
__HOST__ {
	encode gzip
	@public path /mcp /oauth/* /.well-known/*
	handle @public {
		reverse_proxy 127.0.0.1:__PORT__ {
			header_up -CF-Connecting-IP
			header_up -X-Real-IP
		}
	}
	handle {
		basic_auth {
			owner __HASH__
		}
		reverse_proxy 127.0.0.1:__PORT__ {
			header_up -CF-Connecting-IP
			header_up -X-Real-IP
		}
	}
	header -Server
}
