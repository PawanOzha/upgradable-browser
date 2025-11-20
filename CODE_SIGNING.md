# Code Signing Guide for Agentic Browser

## Current Status: ⚠️ UNSIGNED (Development Mode)

The app is currently configured to **allow unsigned updates** for development and testing. This means:

- ✅ Auto-updates work without code signing certificates
- ⚠️ Windows will show security warnings during installation
- ❌ Not recommended for production distribution

---

## Why Code Signing Matters

**Without Code Signing:**
- Windows shows "Unknown publisher" warnings
- Auto-updater requires signature verification bypass
- Users may be hesitant to install
- No proof of authenticity

**With Code Signing:**
- ✅ "Verified publisher" shown in Windows
- ✅ Auto-updater validates updates securely
- ✅ No security warnings during installation
- ✅ Builds trust with users

---

## Development Configuration (Current)

The following settings allow unsigned builds to update:

### `electron/main.ts`
```typescript
autoUpdater.forceDevUpdateConfig = true;
autoUpdater.allowDowngrade = true;
```

### `electron-builder.json5`
```json5
"forceCodeSigning": false
```

---

## Setting Up Code Signing (Production)

### Option 1: Windows Code Signing Certificate

**What You Need:**
- Code signing certificate from a Certificate Authority (CA)
- Certificate file (.pfx or .p12 format)
- Certificate password

**Popular Certificate Providers:**
- DigiCert: ~$300-500/year
- Sectigo: ~$200-400/year
- GlobalSign: ~$200-400/year

**Steps:**

1. **Purchase Certificate**
   - Buy from trusted CA
   - Verify your identity/organization
   - Download certificate (.pfx file)

2. **Configure Electron Builder**
   ```json5
   // electron-builder.json5
   {
     "win": {
       "certificateFile": "./certificates/code-signing.pfx",
       "certificatePassword": "${env.CSC_KEY_PASSWORD}",
       "signingHashAlgorithms": ["sha256"],
       "target": ["nsis"]
     }
   }
   ```

3. **Set Environment Variables**
   ```bash
   # Windows Command Prompt (as Admin)
   setx CSC_KEY_PASSWORD "your_certificate_password" /M

   # Or use .env (NOT recommended for security)
   CSC_KEY_PASSWORD=your_certificate_password
   ```

4. **Update main.ts** (Remove dev config)
   ```typescript
   // Remove these lines:
   autoUpdater.forceDevUpdateConfig = true;
   autoUpdater.allowDowngrade = true;
   ```

5. **Build and Publish**
   ```bash
   npm run build:publish
   ```

---

### Option 2: Azure Cloud Code Signing (Recommended)

**Advantages:**
- No local certificate files
- More secure (private key never leaves Azure)
- Easier certificate management

**Setup:**
1. Create Azure Key Vault
2. Upload certificate to Azure
3. Install Azure SignTool
4. Configure electron-builder to use Azure

**Configuration:**
```json5
{
  "win": {
    "sign": "./scripts/azure-sign.js",
    "target": ["nsis"]
  }
}
```

---

### Option 3: Self-Signed Certificate (Testing Only)

**NOT RECOMMENDED FOR PRODUCTION**

For local testing only:

```bash
# Create self-signed certificate
$cert = New-SelfSignedCertificate -DnsName "Pawan Ozha" -Type CodeSigning -CertStoreLocation Cert:\CurrentUser\My

# Export certificate
$pwd = ConvertTo-SecureString -String "password123" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath ".\cert.pfx" -Password $pwd
```

**Note:** Self-signed certificates still show warnings and don't provide real security.

---

## Testing Current Setup (Unsigned)

The current configuration should work for testing:

1. **Install v1.0.7 or v1.0.8**
2. **App detects new version**
3. **Downloads update** (no signature check)
4. **Installs successfully**

**If signature error persists:**

Check these settings are applied:
```typescript
// In electron/main.ts
autoUpdater.forceDevUpdateConfig = true;
```

```json5
// In electron-builder.json5
"forceCodeSigning": false
```

---

## Production Checklist

Before distributing to end users:

- [ ] Purchase code signing certificate
- [ ] Configure certificate in electron-builder
- [ ] Remove `forceDevUpdateConfig` from main.ts
- [ ] Remove `forceCodeSigning: false` from electron-builder.json5
- [ ] Test signed build
- [ ] Verify auto-update with signed builds
- [ ] Update documentation

---

## Cost Considerations

**Development (Current):**
- Cost: $0
- Security: Basic (unsigned)
- User Trust: Low
- Auto-update: Works with bypass

**Production (Signed):**
- Cost: $200-500/year
- Security: High (verified publisher)
- User Trust: High
- Auto-update: Works securely

---

## Recommended Approach

**For Now (Development/Testing):**
✅ Use current unsigned configuration
✅ Test auto-update functionality
✅ Distribute to internal users only

**For Production (Public Release):**
❗ Get code signing certificate
❗ Sign all releases
❗ Remove dev bypass settings
❗ Test thoroughly before public release

---

## Resources

- [Electron Builder Code Signing](https://www.electron.build/code-signing)
- [electron-updater Documentation](https://www.electron.build/auto-update)
- [Windows Code Signing](https://docs.microsoft.com/en-us/windows-hardware/drivers/dashboard/get-a-code-signing-certificate)
- [DigiCert Code Signing](https://www.digicert.com/code-signing/)

---

## Current Configuration Summary

**Version:** 1.0.8 → 1.0.9 (with unsigned update support)

**Status:**
- ⚠️ Unsigned builds
- ✅ Auto-update enabled
- ✅ Signature verification bypassed
- ⚠️ Development mode only

**Security Note:**
The current setup is **safe for development** but should **not be used for public distribution** without proper code signing.
