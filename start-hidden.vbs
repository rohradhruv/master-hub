' Master Hub — silent auto-start (no window)
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = dir
On Error Resume Next
sh.Run "pythonw server.py", 0, False
If Err.Number <> 0 Then
  Err.Clear
  sh.Run "python server.py", 0, False
End If
