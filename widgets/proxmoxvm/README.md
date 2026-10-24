# Proxmox VM

State, CPU and memory of one Proxmox VM (QEMU) or LXC container, as in homepage. This is the
widget behind a service's `proxmoxNode:` and `proxmoxVMID:` (with `proxmoxType: lxc` for a
container): the state shows as a label in the card's corner, and a click on it shows CPU and
memory. The connection comes from `proxmox.yaml` (see
[Configuration](../../configuration.html#proxmoxyaml)), per node or one for every node.
A paused VM is marked; a stopped one shows as down.

Make a read-only API token in Proxmox: **Datacenter > Permissions > API Tokens > Add** (with
**Privilege Separation** checked), then **Datacenter > Permissions > Add > API Token
Permission** with path `/`, that token and the role **PVEAuditor**. `token` is the token id
(`user@pam!dashboard`), `secret` the value Proxmox shows once.

Proxmox uses a self-signed certificate by default, so `insecure` is on, as in homepage. Set
`insecure: false` in proxmox.yaml when Proxmox has a trusted certificate.

Learn more about [Proxmox VE](https://www.proxmox.com/en/proxmox-virtual-environment).

## Fields

`status`, `cpu`, `mem`

## Example

```yaml
# proxmox.yaml
pve:                                   # the node name, as in proxmoxNode
  url: https://pve.lan:8006
  token: api@pam!dashboard
  secret: "{{HD_VAR_PROXMOX_SECRET}}"

# services.yaml
- Home:
    - Home Assistant:
        href: http://homeassistant.lan:8123
        proxmoxNode: pve
        proxmoxVMID: 101               # a VM; proxmoxType: lxc for a container
    - Proxmox VM:
        widget:                        # or as a widget on the card, homepage's proxmoxvm
          type: proxmoxvm
          node: pve
          vmid: 101
```
