$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$vaultRequest = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class VideoStudioVault {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Credential {
    public uint Flags; public uint Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;
    public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool Write(ref Credential credential, uint flags);
  [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool Read(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool Delete(string target, uint type, uint flags);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr credential);
  public static void Save(string target, string value) {
    byte[] bytes = Encoding.Unicode.GetBytes(value);
    if (bytes.Length > 2560) throw new Exception("Credential too long");
    IntPtr blob = Marshal.AllocCoTaskMem(bytes.Length);
    try {
      Marshal.Copy(bytes, 0, blob, bytes.Length);
      Credential c = new Credential { Type=1, TargetName=target, UserName="CodexVideoStudio", CredentialBlobSize=(uint)bytes.Length, CredentialBlob=blob, Persist=2 };
      if (!Write(ref c, 0)) throw new Exception("Credential write failed: " + Marshal.GetLastWin32Error());
    } finally { for(int i=0;i<bytes.Length;i++) Marshal.WriteByte(blob,i,0); Marshal.FreeCoTaskMem(blob); Array.Clear(bytes,0,bytes.Length); }
  }
  public static string Load(string target) {
    IntPtr ptr;
    if (!Read(target,1,0,out ptr)) { if(Marshal.GetLastWin32Error()==1168) return ""; throw new Exception("Credential read failed"); }
    try { Credential c=(Credential)Marshal.PtrToStructure(ptr,typeof(Credential)); return Marshal.PtrToStringUni(c.CredentialBlob,(int)c.CredentialBlobSize/2); }
    finally { CredFree(ptr); }
  }
  public static void Remove(string target) { if(!Delete(target,1,0) && Marshal.GetLastWin32Error()!=1168) throw new Exception("Credential delete failed"); }
}
'@
if (-not $vaultRequest.target.StartsWith('CodexVideoStudio/')) { throw 'Invalid credential target' }
switch ($vaultRequest.action) {
  'set' { [VideoStudioVault]::Save($vaultRequest.target, $vaultRequest.value); [Console]::Write('{"ok":true}') }
  'get' { @{value=[VideoStudioVault]::Load($vaultRequest.target)} | ConvertTo-Json -Compress | ForEach-Object { [Console]::Write($_) } }
  'delete' { [VideoStudioVault]::Remove($vaultRequest.target); [Console]::Write('{"ok":true}') }
  default { throw 'Invalid credential action' }
}
