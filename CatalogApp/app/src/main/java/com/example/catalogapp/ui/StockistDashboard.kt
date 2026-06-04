package com.example.catalogapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.example.catalogapp.data.*
import kotlinx.coroutines.launch
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockistDashboard(
    sessionManager: SessionManager,
    onLogout: () -> Unit,
    onSwitchMode: () -> Unit
) {
    val coroutineScope = rememberCoroutineScope()
    var categories by remember { mutableStateOf<List<CategoryDto>>(emptyList()) }
    var selectedCategory by remember { mutableStateOf<CategoryDto?>(null) }
    var items by remember { mutableStateOf<List<SKUItemDto>>(emptyList()) }
    
    var isLoading by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf("") }
    
    var currentPage by remember { mutableStateOf(1) }
    var hasMoreItems by remember { mutableStateOf(true) }
    
    val apiService = NetworkClient.getApiService(sessionManager)

    // Load categories on start
    val loadCategories = {
        isLoading = true
        errorMsg = ""
        coroutineScope.launch {
            try {
                categories = apiService.getCategories()
            } catch (e: retrofit2.HttpException) {
                val errorBody = e.response()?.errorBody()?.string()
                if (errorBody != null && errorBody.contains("pending")) {
                    errorMsg = "Device pending approval. Please approve this device UUID in the Admin Web Portal.\nUUID: ${sessionManager.getDeviceUuid().take(12)}..."
                } else if (errorBody != null && errorBody.contains("disabled")) {
                    errorMsg = "Your account has been disabled."
                } else if (errorBody != null && errorBody.contains("restricted")) {
                    errorMsg = "Access restricted outside working hours."
                } else {
                    errorMsg = "Server returned error: ${e.message()}"
                }
            } catch (e: Exception) {
                errorMsg = "Failed to load folders. Pull to refresh."
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadCategories()
    }

    var searchQuery by remember { mutableStateOf("") }

    val loadItems = { category: CategoryDto, page: Int ->
        if (page == 1) {
            isLoading = true
            items = emptyList()
            currentPage = 1
            hasMoreItems = true
        }
        coroutineScope.launch {
            try {
                val fetched = apiService.getCategoryItems(
                    categoryId = category.id,
                    page = page,
                    limit = 30,
                    search = searchQuery.ifEmpty { null }
                )
                if (fetched.size < 30) {
                    hasMoreItems = false
                }
                if (page == 1) {
                    items = fetched
                } else {
                    items = items + fetched
                }
                currentPage = page
            } catch (e: Exception) {
                errorMsg = "Failed to load SKU list."
            } finally {
                isLoading = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        text = selectedCategory?.name ?: "Stock Folders",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                },
                navigationIcon = {
                    if (selectedCategory != null) {
                        IconButton(onClick = { 
                            selectedCategory = null 
                            items = emptyList()
                            searchQuery = ""
                        }) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
                actions = {
                    val userRole = sessionManager.getUserRole()
                    if (userRole == "both" || userRole == "manager") {
                        IconButton(onClick = onSwitchMode) {
                            Icon(Icons.Default.ShoppingCart, contentDescription = "Switch to Sales Mode")
                        }
                    }
                    IconButton(onClick = { 
                        if (selectedCategory != null) loadItems(selectedCategory!!, 1) else loadCategories()
                    }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Default.ExitToApp, contentDescription = "Log out")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            if (isLoading && items.isEmpty() && categories.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else if (errorMsg.isNotEmpty()) {
                Text(
                    text = errorMsg,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(16.dp)
                )
            } else if (selectedCategory == null) {
                // Category List Screen
                if (categories.isEmpty()) {
                    Text(
                        text = "No folder categories assigned to you.",
                        modifier = Modifier.align(Alignment.Center),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(categories) { category ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { 
                                        selectedCategory = category
                                        loadItems(category, 1)
                                    },
                                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(20.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text(
                                            text = category.name,
                                            fontSize = 16.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                        Text(
                                            text = "A-${category.active_count}  OS-${category.os_count}  (Total: ${category.sku_count})",
                                            fontSize = 12.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Text(
                                        text = "Open >",
                                        fontSize = 13.sp,
                                        color = MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }

                        item {
                            Spacer(modifier = Modifier.height(24.dp))
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    text = "Powered by VS FASHION",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                                )
                                Text(
                                    text = "Designed by VS FASHION",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                                )
                            }
                            Spacer(modifier = Modifier.height(16.dp))
                        }
                    }
                }
            } else {
                // SKU Stock Management Screen
                Column(modifier = Modifier.fillMaxSize()) {
                    // Search Bar
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { 
                            searchQuery = it 
                            loadItems(selectedCategory!!, 1)
                        },
                        placeholder = { Text("Search SKU ID...") },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                        trailingIcon = {
                            if (searchQuery.isNotEmpty()) {
                                IconButton(onClick = { 
                                    searchQuery = "" 
                                    loadItems(selectedCategory!!, 1)
                                }) {
                                    Icon(Icons.Default.Clear, contentDescription = "Clear")
                                }
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp)
                    )

                    // Folder active and os counts header
                    Text(
                        text = "A-${selectedCategory?.active_count ?: 0}  OS-${selectedCategory?.os_count ?: 0}  (Total: ${selectedCategory?.sku_count ?: 0} articles)",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                    )

                    if (items.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = if (searchQuery.isNotEmpty()) "No SKUs match \"$searchQuery\"" else "No SKU items found in this folder.",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(16.dp),
                                textAlign = TextAlign.Center
                            )
                        }
                    } else {
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(1),
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            contentPadding = PaddingValues(12.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(items, key = { it.id }) { item ->
                                StockItemCard(
                                    item = item,
                                    sessionManager = sessionManager,
                                    apiService = apiService
                                )
                            }

                            if (hasMoreItems && items.isNotEmpty()) {
                                item {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 12.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Button(
                                            onClick = { loadItems(selectedCategory!!, currentPage + 1) },
                                            colors = ButtonDefaults.buttonColors(
                                                containerColor = MaterialTheme.colorScheme.primaryContainer,
                                                contentColor = MaterialTheme.colorScheme.onPrimaryContainer
                                            ),
                                            shape = RoundedCornerShape(12.dp)
                                        ) {
                                            Text("Load More Articles", fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun StockItemCard(
    item: SKUItemDto,
    sessionManager: SessionManager,
    apiService: CatalogApiService
) {
    // Current stock and rate states
    var sets by remember { mutableStateOf(item.sets_count) }
    var isAvailable by remember { mutableStateOf(item.is_available) }
    var rateText by remember { mutableStateOf(item.rate.toString()) }
    var isUpdating by remember { mutableStateOf(false) }
    var isSuccess by remember { mutableStateOf(false) }
    var imageUrl by remember { mutableStateOf(item.getThumbnailImageUrl(sessionManager.getServerUrl())) }
    
    val scope = rememberCoroutineScope()
    val totalQty = sets * item.pieces_per_set

    // Stock aging attributes
    val age = item.age_in_days ?: 0
    val ageColor = when {
        age >= 90 -> Color(0xFFEF4444) // Red for very old
        age >= 60 -> Color(0xFFF97316) // Orange for 60-90 days old
        else -> Color(0xFF10B981) // Green for active new stock
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // High-Performance Thumbnail Preview
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(imageUrl)
                    .crossfade(true)
                    .build(),
                contentDescription = item.sku_id,
                onError = {
                    val fallback = item.getFullImageUrl(sessionManager.getServerUrl())
                    if (imageUrl != fallback) {
                        imageUrl = fallback
                    }
                },
                modifier = Modifier
                    .size(105.dp)
                    .clip(RoundedCornerShape(8.dp)),
                contentScale = ContentScale.Crop
            )

            Spacer(modifier = Modifier.width(12.dp))

            // SKU Details and stock selectors
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = item.sku_id,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                )
                Text(
                    text = "Pack: ${item.pieces_per_set} pcs/set",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                // Stock Age Badge
                Text(
                    text = "$age days old",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = ageColor,
                    modifier = Modifier.padding(top = 2.dp)
                )
                
                Spacer(modifier = Modifier.height(6.dp))

                // Sets counter increment / decrement
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    IconButton(
                        onClick = { if (sets > 0) sets-- },
                        modifier = Modifier.size(30.dp),
                        colors = IconButtonDefaults.iconButtonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Text("-", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }

                    Text(
                        text = "$sets sets",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold
                    )

                    IconButton(
                        onClick = { sets++ },
                        modifier = Modifier.size(30.dp),
                        colors = IconButtonDefaults.iconButtonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Add", modifier = Modifier.size(14.dp))
                    }
                }
                
                Text(
                    text = "Total pieces: $totalQty",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }

            Spacer(modifier = Modifier.width(4.dp))

            // Right actions column (Rate Input, Switch Availability, Update button)
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.width(100.dp)
            ) {
                // Inline Rate Field (Pricing adjustments)
                OutlinedTextField(
                    value = rateText,
                    onValueChange = { newValue ->
                        if (newValue.isEmpty() || newValue.all { it.isDigit() }) {
                            rateText = newValue
                        }
                    },
                    label = { Text("Rate (₹)", fontSize = 9.sp) },
                    enabled = sessionManager.canEditRates(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    textStyle = androidx.compose.ui.text.TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Bold),
                    singleLine = true,
                    shape = RoundedCornerShape(8.dp)
                )

                // Availability Toggle
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Text(
                        text = if (isAvailable) "Active" else "Out",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isAvailable) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                    )
                    Switch(
                        checked = isAvailable,
                        onCheckedChange = { isAvailable = it },
                        modifier = Modifier.scale(0.65f)
                    )
                }

                // Save Changes button
                Button(
                    onClick = {
                        isUpdating = true
                        isSuccess = false
                        scope.launch {
                            try {
                                val rateVal = rateText.toIntOrNull() ?: item.rate
                                apiService.updateStock(
                                    item.id,
                                    StockUpdateRequest(setsCount = sets, isAvailable = isAvailable, rate = rateVal)
                                )
                                isSuccess = true
                            } catch (e: Exception) {
                                // silent catch or failure state
                            } finally {
                                isUpdating = false
                            }
                        }
                    },
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(30.dp),
                    enabled = !isUpdating,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isSuccess) Color(0xFF10B981) else MaterialTheme.colorScheme.primary
                    ),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    if (isUpdating) {
                        Box(
                            modifier = Modifier.size(12.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(strokeWidth = 2.dp, color = Color.White)
                        }
                    } else if (isSuccess) {
                        Icon(Icons.Default.Check, contentDescription = "Saved", modifier = Modifier.size(12.dp))
                        Spacer(modifier = Modifier.width(2.dp))
                        Text("Saved", fontSize = 10.sp)
                    } else {
                        Text("Save", fontSize = 10.sp)
                    }
                }
            }
        }
    }
}
