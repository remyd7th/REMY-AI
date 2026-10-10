$body = @{
  userId      = "test"
  workspaceId = "test"
  message     = "Hello, are you working?"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4000/api/chat" -Method Post -ContentType "application/json" -Body $body
