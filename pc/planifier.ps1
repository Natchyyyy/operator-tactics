# Crée (ou recrée) la tâche planifiée Windows qui lance pc/cycle.py toutes les 5 minutes, sans fenêtre : attente d'une demande sur la branche pc-demande (un git ls-remote), cycle seulement si une nouvelle demande est arrivée.
#   powershell -File pc\planifier.ps1            créer / mettre à jour
#   powershell -File pc\planifier.ps1 -Retirer   supprimer la tâche
# Journal : pc_journal.log à la racine du dépôt (non versionné). Pause : Disable-ScheduledTask -TaskName "OperatorTactics-PC"
param([switch]$Retirer, [int]$Minutes = 5)
$nom = 'OperatorTactics-PC'
if ($Retirer) { Unregister-ScheduledTask -TaskName $nom -Confirm:$false; "Tâche $nom supprimée."; return }
$depot = Split-Path -Parent $PSScriptRoot
$pyw = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\pythonw.exe'
$action = New-ScheduledTaskAction -Execute $pyw -Argument '"pc\cycle.py"' -WorkingDirectory $depot
$declencheur = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes $Minutes)
$reglages = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $nom -Action $action -Trigger $declencheur -Settings $reglages -Principal $principal -Description 'OPERATOR TACTICS : tests et rendus GPU sur demande (branche pc-demande), résultats poussés sur pc-resultats' -Force | Out-Null
Get-ScheduledTask -TaskName $nom | Get-ScheduledTaskInfo | Select-Object TaskName, NextRunTime
