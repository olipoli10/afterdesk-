#!/bin/sh
set -eu

input_file="/tmp/native-input"
probe_file="/tmp/native-noexec-probe"

cat > "$input_file"
input_digest="$(sha256sum "$input_file" | awk '{print $1}')"

root_read_only=false
if grep ' / ' /proc/mounts | awk '{print $4}' | tr ',' '\n' | grep -qx ro; then
  root_read_only=true
fi

bundle_read_only=false
if ! touch /bundle/should-not-write 2>/dev/null; then
  bundle_read_only=true
fi

tmpfs_writable=false
if touch /tmp/should-write 2>/dev/null; then
  tmpfs_writable=true
fi

printf '#!/bin/sh\nexit 0\n' > "$probe_file"
chmod 0700 "$probe_file"
tmpfs_noexec=false
if ! "$probe_file" >/dev/null 2>&1; then
  tmpfs_noexec=true
fi

bundle_no_git=true
test ! -e /bundle/.git || bundle_no_git=false
socket_absent=true
test ! -S /run/podman/podman.sock || socket_absent=false
test ! -S /var/run/docker.sock || socket_absent=false

network_interfaces="$(for interface in /sys/class/net/*; do basename "$interface"; done | sort | paste -sd, -)"
environment_names="$(env | cut -d= -f1 | sort | paste -sd, -)"
cap_eff="$(awk '/^CapEff:/ {print $2}' /proc/self/status)"
no_new_privs="$(awk '/^NoNewPrivs:/ {print $2}' /proc/self/status)"
seccomp="$(awk '/^Seccomp:/ {print $2}' /proc/self/status)"
cpu_max="$(cat /sys/fs/cgroup/cpu.max)"

printf '%s\n' \
  "RUNNING_UID=$(id -u)" \
  "CAP_EFF=$cap_eff" \
  "NO_NEW_PRIVS=$no_new_privs" \
  "SECCOMP=$seccomp" \
  "NETWORK_INTERFACES=$network_interfaces" \
  "MEMORY_LIMIT=$(cat /sys/fs/cgroup/memory.max)" \
  "PIDS_LIMIT=$(cat /sys/fs/cgroup/pids.max)" \
  "CPU_MAX=$cpu_max" \
  "ENVIRONMENT_NAMES=$environment_names" \
  "INPUT_DIGEST=$input_digest" \
  "ROOT_READ_ONLY=$root_read_only" \
  "BUNDLE_READ_ONLY=$bundle_read_only" \
  "TMPFS_WRITABLE=$tmpfs_writable" \
  "TMPFS_NOEXEC=$tmpfs_noexec" \
  "BUNDLE_NO_GIT=$bundle_no_git" \
  "SOCKET_ABSENT=$socket_absent"

rm -f "$input_file" "$probe_file" /tmp/should-write
