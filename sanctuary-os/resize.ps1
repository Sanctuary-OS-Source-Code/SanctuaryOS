[System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null
$img = [System.Drawing.Image]::FromFile('C:\Users\Jesse\Desktop\Solder Republic\sanctuary-os\app-icon.png')
$bmp = New-Object System.Drawing.Bitmap 1024, 1024
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, 1024, 1024)
$g.Dispose()
$img.Dispose()
$bmp.Save('C:\Users\Jesse\Desktop\Solder Republic\sanctuary-os\app-icon-square.png', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
