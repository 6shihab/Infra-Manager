import requests

# 1. Login
response = requests.post("http://localhost:8000/auth/token", data={"username": "admin@inframanager.local", "password": "admin"})
token = response.json().get("access_token")
headers = {"Authorization": f"Bearer {token}"}

# 2. Try creating a user
user_data = {
    "email": "testuser@example.com",
    "password": "password123",
    "full_name": "Test User",
    "is_active": True,
    "is_superuser": False
}
res_create = requests.post("http://localhost:8000/users/", json=user_data, headers=headers)
print("Create User Response:", res_create.status_code, res_create.text)

# 3. Create a group
group_data = {
    "name": "Test Group",
    "description": "desc"
}
res_group = requests.post("http://localhost:8000/groups/", json=group_data, headers=headers)
print("Create Group Response:", res_group.status_code, res_group.text)

if res_group.status_code == 200 and res_create.status_code == 200:
    group_id = res_group.json()["id"]
    user_id = res_create.json()["id"]
    
    # 4. Try adding user to group
    res_assign = requests.post(f"http://localhost:8000/groups/{group_id}/users/{user_id}", headers=headers)
    print("Assign User Response:", res_assign.status_code, res_assign.text)
