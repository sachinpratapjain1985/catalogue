package com.example.catalogapp.ui

import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.example.catalogapp.data.*
import com.example.catalogapp.utils.SharingUtils
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SalesDashboard(
    sessionManager: SessionManager,
    onLogout: () -> Unit,
    onSwitchMode: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    
    var categories by remember { mutableStateOf<List<CategoryDto>>(emptyList()) }
    var selectedCategory by remember { mutableStateOf<CategoryDto?>(null) }
    var items by remember { mutableStateOf<List<SKUItemDto>>(emptyList()) }
    
    // Selection state
    val selectedItems = remember { mutableStateListOf<SKUItemDto>() }
    
    // Loading/Error states
    var isLoading by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf("") }
    
    // Pagination states
    var currentPage by remember { mutableStateOf(1) }
    var hasMoreItems by remember { mutableStateOf(true) }
    
    // Sharing dialogue progress state
    var isSharing by remember { mutableStateOf(false) }
    var shareProgressMsg by remember { mutableStateOf("") }

    val apiService = NetworkClient.getApiService(sessionManager)

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
                errorMsg = "Connection error. Pull to refresh."
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadCategories()
    }

    val loadItems = { category: CategoryDto, page: Int ->
        if (page == 1) {
            isLoading = true
            items = emptyList()
            selectedItems.clear()
            currentPage = 1
            hasMoreItems = true
        }
        coroutineScope.launch {
            try {
                val fetched = apiService.getCategoryItems(category.id, page = page, limit = 30)
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
                errorMsg = "Failed to fetch designs."
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
                        text = selectedCategory?.name ?: "Sales Catalogue",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                },
                navigationIcon = {
                    if (selectedCategory != null) {
                        IconButton(onClick = { 
                            selectedCategory = null 
                            items = emptyList()
                            selectedItems.clear()
                        }) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
                actions = {
                    val userRole = sessionManager.getUserRole()
                    if (userRole == "both" || userRole == "manager") {
                        IconButton(onClick = onSwitchMode) {
                            Icon(Icons.Default.Build, contentDescription = "Switch to Stockist Mode", tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                    IconButton(onClick = { 
                        if (selectedCategory != null) loadItems(selectedCategory!!, 1) else loadCategories()
                    }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Default.ExitToApp, contentDescription = "Logout")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        },
        bottomBar = {
            if (selectedItems.isNotEmpty()) {
                Surface(
                    tonalElevation = 8.dp,
                    shadowElevation = 8.dp,
                    color = MaterialTheme.colorScheme.surfaceColorAtElevation(8.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(
                                text = "${selectedItems.size} items selected",
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp
                            )
                            Text(
                                text = "Ready to share actual photos",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        Button(
                            onClick = {
                                isSharing = true
                                coroutineScope.launch {
                                    SharingUtils.downloadAndShareImages(
                                        context = context,
                                        selectedItems = selectedItems.toList(),
                                        sessionManager = sessionManager,
                                        onProgress = { shareProgressMsg = it },
                                        onError = {
                                            isSharing = false
                                            Toast.makeText(context, it, Toast.LENGTH_LONG).show()
                                        }
                                    )
                                    isSharing = false
                                }
                            },
                            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp)
                        ) {
                            Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Share via WhatsApp", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
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
                // Categories List Selection
                if (categories.isEmpty()) {
                    Text(
                        text = "No folder categories available.",
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
                                            text = "Browse available designs",
                                            fontSize = 12.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Icon(
                                        Icons.Default.Share, 
                                        contentDescription = null, 
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            } else {
                // SKU Showcase Grid Selection
                if (items.isEmpty()) {
                    Text(
                        text = "No available items found in this section.",
                        modifier = Modifier.align(Alignment.Center),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(items, key = { it.id }) { item ->
                            val isSelected = selectedItems.any { it.id == item.id }
                            SalesItemCard(
                                item = item,
                                isSelected = isSelected,
                                sessionManager = sessionManager,
                                onSelectToggle = {
                                    if (isSelected) {
                                        selectedItems.removeAll { it.id == item.id }
                                    } else {
                                        selectedItems.add(item)
                                    }
                                }
                            )
                        }

                        if (hasMoreItems && items.isNotEmpty()) {
                            item(span = { GridItemSpan(maxLineSpan) }) {
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

            // Sharing Progress Modal Dialog
            if (isSharing) {
                AlertDialog(
                    onDismissRequest = {},
                    confirmButton = {},
                    title = { Text("Preparing Share Bundle") },
                    text = {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.fillMaxWidth().padding(8.dp)
                        ) {
                            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = shareProgressMsg,
                                fontSize = 14.sp,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                )
            }
        }
    }
}

@Composable
fun SalesItemCard(
    item: SKUItemDto,
    isSelected: Boolean,
    sessionManager: SessionManager,
    onSelectToggle: () -> Unit
) {
    var imageUrl by remember { mutableStateOf(item.getThumbnailImageUrl(sessionManager.getServerUrl())) }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onSelectToggle() }
            .border(
                width = if (isSelected) 3.dp else 1.dp,
                color = if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent,
                shape = RoundedCornerShape(12.dp)
            ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            // High-Performance Thumbnail Image Box with overlays
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(0.75f) // Beautiful Portrait 3:4 aspect ratio
            ) {
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
                        .fillMaxSize()
                        .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)),
                    contentScale = ContentScale.Crop
                )

                // Top-Left SKU Badge
                Box(
                    modifier = Modifier
                        .padding(8.dp)
                        .background(
                            color = Color.Black.copy(alpha = 0.6f),
                            shape = RoundedCornerShape(6.dp)
                        )
                        .padding(horizontal = 6.dp, vertical = 3.dp)
                        .align(Alignment.TopStart)
                ) {
                    Text(
                        text = item.sku_id,
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Top-Right Stock Sets Badge
                Box(
                    modifier = Modifier
                        .padding(8.dp)
                        .background(
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.85f),
                            shape = RoundedCornerShape(6.dp)
                        )
                        .padding(horizontal = 6.dp, vertical = 3.dp)
                        .align(Alignment.TopEnd)
                ) {
                    Text(
                        text = "${item.sets_count} sets",
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Overlay Selection indicator checkmark icon
                if (isSelected) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.3f))
                    )
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = "Selected",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .padding(8.dp)
                            .align(Alignment.BottomEnd)
                            .size(24.dp)
                            .background(Color.White, shape = RoundedCornerShape(percent = 50))
                    )
                }
            }

            // Compact bottom information container
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "₹${item.rate}",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                val detailText = when {
                    !item.material.isNullOrBlank() -> item.material
                    !item.description.isNullOrBlank() -> item.description
                    else -> ""
                }
                if (detailText.isNotEmpty()) {
                    Text(
                        text = detailText,
                        fontSize = 10.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        textAlign = TextAlign.End,
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = 6.dp)
                    )
                }
            }
        }
    }
}
