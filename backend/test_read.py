import requests

response = requests.post("http://localhost:8000/auth/token", data={"username": "admin@inframanager.local", "password": "admin"})
token = response.json().get("access_token")
headers = {"Authorization": f"Bearer {token}"}

# Get users
users = requests.get("http://localhost:8000/users/", headers=headers).json()
print("USERS:", users)

# Get groups
groups = requests.get("http://localhost:8000/groups/", headers=headers).json()
print("GROUPS:", groups)
