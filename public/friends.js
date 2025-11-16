// Search users
document.querySelector("#searchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = document.querySelector("#searchInput").value;

  const res = await fetch(`/search?username=${query}`);
  const data = await res.json();

  const resultDiv = document.querySelector("#searchResult");
  resultDiv.innerHTML = "";

  if (data.success && data.user) {
    resultDiv.innerHTML = `
      <p>Found: ${data.user.username}</p>
      <button id="addFriendBtn">Add Friend</button>
    `;

    document.querySelector("#addFriendBtn").addEventListener("click", async () => {
      const res2 = await fetch("/add-friend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendId: data.user._id })
      });

      const data2 = await res2.json();
      alert(data2.message);
    });
  } else {
    resultDiv.innerHTML = "<p>No user found 😢</p>";
  }
});

// Load your friends
async function loadFriends() {
  const res = await fetch("/friends");
  const data = await res.json();
  const list = document.querySelector("#friendList");

  list.innerHTML = "";
  data.friends.forEach((f) => {
    const li = document.createElement("li");
    li.textContent = f.username;
    list.appendChild(li);
  });
}

loadFriends();
