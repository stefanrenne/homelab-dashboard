# Proxmox

`proxmox.yaml` lists Proxmox nodes, for `proxmoxNode:` and `proxmoxVMID:` on a service (as in homepage): the
VM's or container's state as a label in the card's corner, with CPU and memory on a click.

```yaml
pve:                                   # the node name, as in proxmoxNode
  url: https://pve.lan:8006
  token: api@pam!dashboard             # an API token id
  secret: "{{HD_VAR_PROXMOX_SECRET}}"  # its secret
  insecure: true                       # default: accept Proxmox's self-signed certificate
```

homepage's older form, one `url`, `token` and `secret` at the top for every node, works too.
Make the token under **Datacenter > Permissions > API Tokens** and give it the role
**PVEAuditor** on `/`; see the [Proxmox VM](../widgets/collection/proxmoxvm.html) widget page.
`token` and `secret` stay on the server.

For a whole node or cluster on one card (VMs, containers, CPU, memory), use the
[Proxmox](../widgets/collection/proxmox.html) widget.
