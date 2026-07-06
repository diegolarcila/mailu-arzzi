# Docker Mailserver - arzzi.xyz

This repository contains the configuration for a production-ready, simplified mail server setup using **docker-mailserver** and **Roundcube Webmail** managed via Coolify.

## Services

1. **Mailserver** (`ghcr.io/docker-mailserver/docker-mailserver:latest`)
   - Full stack single-container mail server.
   - Includes SMTP (Postfix), IMAP (Dovecot), Antispam (Rspamd), and Fail2ban.
   - ClamAV is disabled to conserve RAM.

2. **Webmail** (`roundcube/roundcubemail:latest`)
   - Light-weight modern webmail interface accessible via HTTP.
   - Connected to the Mailserver container internally.

## Administration

To add email accounts and generate DKIM keys, run the following commands on the VPS:

### Add Email Account
```bash
docker exec -it mailserver-j7vrlerr67hcw5p67o3b5dh4 setup email add user@arzzi.xyz "yourpassword"
```

### Generate DKIM Keys
```bash
docker exec -it mailserver-j7vrlerr67hcw5p67o3b5dh4 setup config dkim
```
