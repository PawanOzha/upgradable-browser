import { spawn, ChildProcess } from 'child_process';
import { BrowserWindow } from 'electron';

// Keywords to watch for
const KEYWORDS = [
  'email',
  'create',
  'remove',
  'delete',
  'change password',
  'change',
  'password',
  'spacemail',
  'webmail',
  'mail',
  'dear team',
  'new joiner',
  'please create',
  'create account',
  'reset password',
  'update password',
];

interface NotificationMatch {
  content: string;
  matchedKeywords: string[];
  timestamp: Date;
  title?: string;
}

export class WindowsNotificationListener {
  private psProcess: ChildProcess | null = null;
  private mainWindow: BrowserWindow | null = null;
  private isRunning: boolean = false;
  private seenNotifications: Set<string> = new Set();

  constructor(window: BrowserWindow) {
    this.mainWindow = window;
  }

  // Check if text contains any keyword
  private containsKeyword(text: string): string[] {
    const lowerText = text.toLowerCase();
    return KEYWORDS.filter(keyword =>
      lowerText.includes(keyword.toLowerCase())
    );
  }

  // Send notification to renderer process
  private notifyRenderer(match: NotificationMatch) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('windows-notification-detected', match);
      console.log('[NotificationListener] ✅ Keywords detected:', match.matchedKeywords.join(', '));
      console.log('[NotificationListener] 📧 Content:', match.content.substring(0, 100));
    }
  }

  // Start listening to Windows notifications
  start() {
    if (this.isRunning) {
      console.log('[NotificationListener] Already running');
      return;
    }

    console.log('[NotificationListener] 🚀 Starting Windows notification listener...');
    this.isRunning = true;

    // PowerShell script with proper WinRT async handling
    const psScript = `
      Add-Type -AssemblyName System.Runtime.WindowsRuntime

      # Helper to convert WinRT IAsyncOperation to Task and wait
      function Await-AsyncOperation($asyncOp) {
        try {
          # Get the result type from the async operation
          $resultType = $asyncOp.GetType().GenericTypeArguments[0]

          # Get AsTask extension method for IAsyncOperation<T>
          [Windows.Foundation.IAsyncOperation\`1, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
          $asTaskMethod = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
            $_.Name -eq 'AsTask' -and
            $_.GetParameters().Count -eq 1 -and
            $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
          })[0]

          # Make generic method with result type
          $genericMethod = $asTaskMethod.MakeGenericMethod($resultType)

          # Invoke to get Task<T>
          $task = $genericMethod.Invoke($null, @($asyncOp))

          # Wait for completion
          $task.Wait()

          # Return result
          return $task.Result
        } catch {
          Write-Host "ERROR:Await-AsyncOperation failed: $($_.Exception.Message)"
          return $null
        }
      }

      # Load Windows.UI.Notifications
      [Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.UI.Notifications.NotificationKinds, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.UI.Notifications.KnownNotificationBindings, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.Foundation.IAsyncOperation\`1, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

      $seen = @{}

      Write-Host "LISTENER_STARTED"

      while ($true) {
        try {
          $listener = [Windows.UI.Notifications.Management.UserNotificationListener]::Current

          # Request access
          $accessTask = $listener.RequestAccessAsync()
          $accessStatus = Await-AsyncOperation $accessTask

          if ($accessStatus -eq 'Allowed') {
            # Get notifications
            $notificationsTask = $listener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast)
            $notifications = Await-AsyncOperation $notificationsTask

            foreach ($notification in $notifications) {
              try {
                $appInfo = $notification.AppInfo
                $appName = $appInfo.DisplayInfo.DisplayName

                $notificationContent = $notification.Notification
                $visual = $notificationContent.Visual

                if ($visual) {
                  $binding = $visual.GetBinding([Windows.UI.Notifications.KnownNotificationBindings]::ToastGeneric)

                  if ($binding) {
                    $title = ""
                    $body = ""

                    $textElements = $binding.GetTextElements()
                    $count = 0
                    foreach ($text in $textElements) {
                      if ($count -eq 0) {
                        $title = $text.Text
                      } else {
                        $body += $text.Text + " "
                      }
                      $count++
                    }

                    $body = $body.Trim()

                    $key = "$appName|$title|$body"

                    if ($body -and -not $seen.ContainsKey($key)) {
                      $seen[$key] = $true

                      Write-Host "NOTIFICATION_START"
                      Write-Host "APP:$appName"
                      Write-Host "TITLE:$title"
                      Write-Host "BODY:$body"
                      Write-Host "NOTIFICATION_END"
                      Write-Host ""
                    }
                  }
                }
              } catch {
                # Skip individual notification errors
              }
            }
          } else {
            Write-Host "ERROR:Access denied. Enable: Settings > System > Notifications"
            Start-Sleep -Seconds 10
          }

        } catch {
          Write-Host "ERROR:$($_.Exception.Message)"
          Start-Sleep -Seconds 5
        }

        if ($seen.Count -gt 100) {
          $seen.Clear()
        }

        Start-Sleep -Seconds 1
      }
    `;

    // Spawn PowerShell process
    this.psProcess = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command', psScript
    ]);

    let buffer = '';

    // Handle output
    this.psProcess.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();

        if (line === 'LISTENER_STARTED') {
          console.log('[NotificationListener] ✅ PowerShell listener started successfully');
          continue;
        }

        if (line.startsWith('ERROR:')) {
          console.error('[NotificationListener]', line);
          continue;
        }

        if (line === 'NOTIFICATION_START') {
          let app = '';
          let title = '';
          let body = '';
          let j = i + 1;

          // Parse notification data
          while (j < lines.length && lines[j].trim() !== 'NOTIFICATION_END') {
            const dataLine = lines[j].trim();
            if (dataLine.startsWith('APP:')) {
              app = dataLine.substring(4);
            } else if (dataLine.startsWith('TITLE:')) {
              title = dataLine.substring(6);
            } else if (dataLine.startsWith('BODY:')) {
              body = dataLine.substring(5);
            }
            j++;
          }

          // Check for keywords
          const fullContent = `${title} ${body}`.trim();
          if (fullContent) {
            const matchedKeywords = this.containsKeyword(fullContent);

            if (matchedKeywords.length > 0) {
              const notificationKey = `${app}|${title}|${body}`;

              // Prevent duplicates
              if (!this.seenNotifications.has(notificationKey)) {
                this.seenNotifications.add(notificationKey);

                const match: NotificationMatch = {
                  content: body || title,
                  matchedKeywords,
                  timestamp: new Date(),
                  title: title || app,
                };

                console.log('[NotificationListener] 🎯 Match found!');
                console.log('[NotificationListener] 📱 App:', app);
                console.log('[NotificationListener] 🔑 Keywords:', matchedKeywords.join(', '));

                this.notifyRenderer(match);

                // Clean old seen notifications
                if (this.seenNotifications.size > 50) {
                  const values = Array.from(this.seenNotifications);
                  this.seenNotifications = new Set(values.slice(-25));
                }
              }
            }
          }

          i = j;
        }
      }

      buffer = lines[lines.length - 1];
    });

    // Handle errors
    this.psProcess.stderr?.on('data', (data: Buffer) => {
      const error = data.toString();
      if (error.includes('Access') || error.includes('denied')) {
        console.error('[NotificationListener] ❌ Permission error:', error);
      }
    });

    this.psProcess.on('close', (code) => {
      console.log('[NotificationListener] Process exited with code:', code);
      this.isRunning = false;

      // Auto-restart if crashed
      if (code !== 0 && code !== null) {
        console.log('[NotificationListener] Restarting in 5 seconds...');
        setTimeout(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.start();
          }
        }, 5000);
      }
    });

    console.log('[NotificationListener] 📡 Waiting for notifications...');
  }

  // Stop listening
  stop() {
    if (this.psProcess) {
      console.log('[NotificationListener] 🛑 Stopping notification listener...');
      this.psProcess.kill();
      this.psProcess = null;
      this.isRunning = false;
    }
  }

  // Check if running
  getStatus(): boolean {
    return this.isRunning;
  }
}
