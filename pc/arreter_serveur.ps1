# Arrête le serveur local de test (port 8765) s'il tourne encore, et dit ce qui écoutait.
foreach ($c in Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue) {
  $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
  "arrêt du processus $($c.OwningProcess) ($($p.ProcessName)) qui écoutait sur 8765"
  Stop-Process -Id $c.OwningProcess -Force
}
"port 8765 libre"
