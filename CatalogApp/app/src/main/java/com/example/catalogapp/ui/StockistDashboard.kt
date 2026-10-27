package com.example.catalogapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.example.catalogapp.data.*
import kotlinx.coroutines.launch
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.font.FontStyle
import android.widget.Toast


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockistDashboard(
    sessionManager: SessionManager,
    onLogout: () -> Unit,
    onSwitchMode: () -> Unit,
    onBackToSelection: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var categories by remember { mutableStateOf<List<CategoryDto>>(emptyList()) }
    var works by remember { mutableStateOf<List<WorkDto>>(emptyList()) }
    var selectedCategory by remember { mutableStateOf<CategoryDto?>(null) }
    var items by remember { mutableStateOf<List<SKUItemDto>>(emptyList()) }
    
    var isLoading by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf("") }
    
    var currentPage by remember { mutableStateOf(1) }
    var hasMoreItems by remember { mutableStateOf(true) }
    
    var showVisualSearchDialog by remember { mutableStateOf(false) }
    var showFiltersExpanded by remember { mutableStateOf(false) }
    
    val apiService = NetworkClient.getApiService(sessionManager)

    // Load categories on start
    val loadCategories = {
        isLoading = true
        errorMsg = ""
        coroutineScope.launch {
            try {
                categories = apiService.getCategories()
                try {
                    works = apiService.getWorks()
                } catch (e: Exception) {
                    // Non-fatal
                }
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
    var statusFilter by remember { mutableStateOf("") }
    var selectedRateRange by remember { mutableStateOf<Pair<Int?, Int?>?>(null) }
    var selectedWork by remember { mutableStateOf<String?>(null) }

    // Global SKU Search across all folders
    var globalSkuQuery by remember { mutableStateOf("") }
    var globalSearchItems by remember { mutableStateOf<List<SKUItemDto>>(emptyList()) }
    var isSearchingGlobal by remember { mutableStateOf(false) }

    val performGlobalSearch: (String) -> Unit = { query ->
        val trimmed = query.trim()
        if (trimmed.isEmpty()) {
            globalSearchItems = emptyList()
            isSearchingGlobal = false
        } else {
            isSearchingGlobal = true
            coroutineScope.launch {
                try {
                    globalSearchItems = apiService.searchAllItems(search = trimmed)
                } catch (e: Exception) {
                    globalSearchItems = emptyList()
                } finally {
                    isSearchingGlobal = false
                }
            }
        }
    }

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
                    search = searchQuery.ifEmpty { null },
                    status = statusFilter.ifEmpty { null },
                    work = selectedWork,
                    minRate = selectedRateRange?.first,
                    maxRate = selectedRateRange?.second
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
                        fontSize = 16.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                },
                navigationIcon = {
                    if (selectedCategory != null) {
                        IconButton(onClick = { 
                            selectedCategory = null 
                            items = emptyList()
                            searchQuery = ""
                            statusFilter = ""
                            selectedRateRange = null
                            globalSkuQuery = ""
                            globalSearchItems = emptyList()
                        }) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
                actions = {
                    val userRole = sessionManager.getUserRole()
                    if (userRole == "both" || userRole == "manager") {
                        IconButton(onClick = onBackToSelection) {
                            Icon(Icons.Default.Home, contentDescription = "Return to Dashboard")
                        }
                        IconButton(onClick = onSwitchMode) {
                            Icon(Icons.Default.ShoppingCart, contentDescription = "Switch to Sales Mode")
                        }
                    }
                    IconButton(onClick = { 
                        if (selectedCategory != null) {
                            loadItems(selectedCategory!!, 1)
                        } else if (globalSkuQuery.isNotEmpty()) {
                            performGlobalSearch(globalSkuQuery)
                        } else {
                            loadCategories()
                        }
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
                // Category List Screen + Global SKU Search
                Column(modifier = Modifier.fillMaxSize()) {
                    // Global SKU Search Bar across all folders
                    OutlinedTextField(
                        value = globalSkuQuery,
                        onValueChange = { 
                            globalSkuQuery = it 
                            performGlobalSearch(it)
                        },
                        placeholder = { Text("Search SKU across all folders...", fontSize = 13.sp) },
                        leadingIcon = { 
                            Icon(
                                Icons.Default.Search, 
                                contentDescription = "Search SKU", 
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(20.dp)
                            ) 
                        },
                        trailingIcon = {
                            if (globalSkuQuery.isNotEmpty()) {
                                IconButton(onClick = { 
                                    globalSkuQuery = "" 
                                    globalSearchItems = emptyList()
                                }) {
                                    Icon(Icons.Default.Clear, contentDescription = "Clear", modifier = Modifier.size(18.dp))
                                }
                            }
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    )

                    if (globalSkuQuery.isNotEmpty()) {
                        Text(
                            text = "🔍 Results (${globalSearchItems.size} SKUs found)",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                        )

                        if (isSearchingGlobal) {
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator()
                            }
                        } else if (globalSearchItems.isEmpty()) {
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                Text(
                                    text = "No SKUs found matching \"$globalSkuQuery\" across any folders.",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.padding(16.dp)
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
                                items(globalSearchItems, key = { it.id }) { item ->
                                    StockItemCard(
                                        item = item,
                                        sessionManager = sessionManager,
                                        apiService = apiService
                                    )
                                }
                            }
                        }
                    } else if (categories.isEmpty()) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text(
                                text = "No folder categories assigned to you.",
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
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
                                            text = "A-${category.active_count}  OS-${category.os_count}  NA-${category.na_count}  (Total: ${category.sku_count})",
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
                            } else {
                                IconButton(onClick = { showVisualSearchDialog = true }) {
                                    Icon(
                                        Icons.Default.CameraAlt,
                                        contentDescription = "Search by Photo",
                                        tint = Color(0xFFF59E0B)
                                    )
                                }
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp)
                    )

                    // Status Filter Chips
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        val statuses = listOf(
                            "" to "All",
                            "A" to "Available (A)",
                            "OS" to "Out of Stock (OS)",
                            "NA" to "Inactive (NA)"
                        )
                        statuses.forEach { (code, label) ->
                            val isSelected = statusFilter == code
                            Surface(
                                modifier = Modifier
                                    .weight(1f)
                                    .clickable {
                                        statusFilter = code
                                        loadItems(selectedCategory!!, 1)
                                    },
                                shape = RoundedCornerShape(8.dp),
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                                contentColor = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                                border = androidx.compose.foundation.BorderStroke(
                                    width = 1.dp,
                                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
                                )
                            ) {
                                Box(
                                    contentAlignment = Alignment.Center,
                                    modifier = Modifier.padding(vertical = 8.dp)
                                ) {
                                    Text(
                                        text = label.substringBefore(" ("),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }

                    // Expandable Filter Toggle Bar (Price & Work)
                    val activeFilterCount = (if (selectedRateRange != null) 1 else 0) + (if (selectedWork != null) 1 else 0)
                    
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Surface(
                            modifier = Modifier.clickable { showFiltersExpanded = !showFiltersExpanded },
                            shape = RoundedCornerShape(8.dp),
                            color = if (activeFilterCount > 0 || showFiltersExpanded) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (activeFilterCount > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
                            )
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Default.FilterList,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                    tint = if (activeFilterCount > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = if (showFiltersExpanded) "Hide Filters (Price & Work)" else "Filter by Price & Work",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (activeFilterCount > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                if (activeFilterCount > 0) {
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Box(
                                        modifier = Modifier
                                            .size(18.dp)
                                            .background(MaterialTheme.colorScheme.primary, CircleShape),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = "$activeFilterCount",
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.onPrimary
                                        )
                                    }
                                }
                                Spacer(modifier = Modifier.width(4.dp))
                                Icon(
                                    if (showFiltersExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }

                        if (activeFilterCount > 0) {
                            TextButton(
                                onClick = {
                                    selectedRateRange = null
                                    selectedWork = null
                                    loadItems(selectedCategory!!, 1)
                                },
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                                modifier = Modifier.height(28.dp)
                            ) {
                                Text("Clear Filters", fontSize = 11.sp, color = MaterialTheme.colorScheme.error)
                            }
                        }
                    }

                    if (showFiltersExpanded) {
                        // Price Filter Chips
                        val rateOptions = listOf(
                            "All Prices" to null,
                            "Below ₹1k" to (null to 1000),
                            "Below ₹1.5k" to (null to 1500),
                            "Below ₹2k" to (null to 2000),
                            "Below ₹2.5k" to (null to 2500),
                            "₹1k - ₹1.5k" to (1000 to 1500),
                            "₹1k - ₹2k" to (1000 to 2000),
                            "₹1.5k - ₹2k" to (1500 to 2000),
                            "₹2k - ₹3k" to (2000 to 3000),
                            "Above ₹2k" to (2000 to null),
                            "Above ₹2.5k" to (2500 to null),
                            "Above ₹3k" to (3000 to null)
                        )

                        LazyRow(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 2.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(rateOptions) { (label, range) ->
                                val isSelected = selectedRateRange == range
                                FilterChip(
                                    selected = isSelected,
                                    onClick = {
                                        selectedRateRange = if (isSelected) null else range
                                        loadItems(selectedCategory!!, 1)
                                    },
                                    label = {
                                        Text(
                                            text = label,
                                            fontSize = 12.sp,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                        )
                                    }
                                )
                            }
                        }

                        // Work Filter Chips
                        if (works.isNotEmpty()) {
                            LazyRow(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 2.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                item {
                                    FilterChip(
                                        selected = selectedWork == null,
                                        onClick = {
                                            if (selectedWork != null) {
                                                selectedWork = null
                                                loadItems(selectedCategory!!, 1)
                                            }
                                        },
                                        label = {
                                            Text(
                                                text = "All Works",
                                                fontSize = 12.sp,
                                                fontWeight = if (selectedWork == null) FontWeight.Bold else FontWeight.Normal
                                            )
                                        }
                                    )
                                }
                                items(works) { w ->
                                    val isSelected = selectedWork == w.name
                                    FilterChip(
                                        selected = isSelected,
                                        onClick = {
                                            selectedWork = if (isSelected) null else w.name
                                            loadItems(selectedCategory!!, 1)
                                        },
                                        label = {
                                            Text(
                                                text = w.name,
                                                fontSize = 12.sp,
                                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                            )
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // Folder active, os, and na counts header
                    Text(
                        text = "A-${selectedCategory?.active_count ?: 0}  OS-${selectedCategory?.os_count ?: 0}  NA-${selectedCategory?.na_count ?: 0}  (Total: ${selectedCategory?.sku_count ?: 0} articles)",
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
                            if (isLoading) {
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center
                                ) {
                                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                                    Spacer(modifier = Modifier.height(12.dp))
                                    Text(
                                        text = "Loading SKU items, please wait...",
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            } else {
                                Text(
                                    text = if (searchQuery.isNotEmpty()) "No SKUs match \"$searchQuery\"" else "No SKU items found in this folder.",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(16.dp),
                                    textAlign = TextAlign.Center
                                )
                            }
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

            // Visual AI Search Dialog
            if (showVisualSearchDialog) {
                VisualSearchDialog(
                    sessionManager = sessionManager,
                    onDismiss = { showVisualSearchDialog = false },
                    onSelectSKU = { matchedItem ->
                        showVisualSearchDialog = false
                        searchQuery = matchedItem.sku_id
                        statusFilter = ""
                        selectedRateRange = null
                        selectedWork = null
                        val matchedCat = categories.find { it.id == matchedItem.category_id }
                            ?: CategoryDto(
                                id = matchedItem.category_id,
                                name = matchedItem.category_name ?: "Matched Catalog",
                                sku_count = 1
                            )
                        selectedCategory = matchedCat
                        items = listOf(matchedItem)
                        hasMoreItems = false
                        loadItems(matchedCat, 1)
                        Toast.makeText(context, "Matched: ${matchedItem.sku_id}", Toast.LENGTH_SHORT).show()
                    }
                )
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
    val context = LocalContext.current
    // Current stock and rate states
    var sets by remember { mutableStateOf(item.sets_count) }
    var isAvailable by remember { mutableStateOf(item.is_available) }
    var rateText by remember { mutableStateOf(item.rate.toString()) }
    var revisedRateText by remember { mutableStateOf(item.revised_rate?.toString() ?: "") }
    var currentRevisedRate by remember { mutableStateOf(item.revised_rate) }
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

    var showZoomDialog by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            // Main Top Content Row: Image + Complete Details
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top
            ) {
                // High-Performance Thumbnail Preview with Zoom Trigger
                Box(
                    modifier = Modifier
                        .size(105.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { showZoomDialog = true }
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
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )

                    // Real Photos / Zoom Hint Badge
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(4.dp)
                            .background(Color.Black.copy(alpha = 0.65f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 4.dp, vertical = 2.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(2.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Search,
                                contentDescription = "Zoom",
                                tint = Color.White,
                                modifier = Modifier.size(11.dp)
                            )
                            Text(
                                text = if (sessionManager.canAccessRealImages() && item.real_image_count > 0) "Real (${item.real_image_count})" else "Zoom",
                                color = Color.White,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                // SKU Details Column (Full width without being squished!)
                Column(
                    modifier = Modifier.weight(1f)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = item.sku_id,
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            color = MaterialTheme.colorScheme.onSurface
                        )

                        // Status pill badge
                        val statusLabel = when {
                            !isAvailable -> "Inactive"
                            sets > 0 -> "Active"
                            else -> "Out Stock"
                        }
                        val statusBg = when {
                            !isAvailable -> MaterialTheme.colorScheme.errorContainer
                            sets > 0 -> Color(0xFFD1FAE5) // light green
                            else -> Color(0xFFFFEDD5) // light orange
                        }
                        val statusColor = when {
                            !isAvailable -> MaterialTheme.colorScheme.error
                            sets > 0 -> Color(0xFF047857) // dark green
                            else -> Color(0xFFC2410C) // dark orange
                        }
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = statusBg,
                            modifier = Modifier.padding(start = 4.dp)
                        ) {
                            Text(
                                text = statusLabel,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = statusColor,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }

                    // Pack details
                    Text(
                        text = "Pack: ${item.pieces_per_set} pcs/set",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 1.dp)
                    )

                    // Fabric / Material (Visible now!)
                    if (!item.material.isNullOrBlank()) {
                        Text(
                            text = "Fabric: ${item.material}",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    // Work Details
                    if (!item.work.isNullOrBlank()) {
                        Text(
                            text = "✨ Work: ${item.work}",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    // Description / Notes (Visible now!)
                    if (!item.description.isNullOrBlank()) {
                        Text(
                            text = item.description,
                            fontSize = 11.sp,
                            fontStyle = FontStyle.Italic,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(top = 1.dp)
                        )
                    }

                    // Pricing & Age Row
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 3.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Rate / Offer display
                        if (currentRevisedRate != null && currentRevisedRate!! > 0 && currentRevisedRate != item.rate) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = "₹${item.rate}",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = androidx.compose.ui.text.TextStyle(textDecoration = TextDecoration.LineThrough)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = "🔥 ₹$currentRevisedRate",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFFD97706)
                                )
                            }
                        } else {
                            Text(
                                text = "Rate: ₹${item.rate}",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }

                        // Stock Age Badge
                        Text(
                            text = "$age days old",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = ageColor
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            Divider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
            Spacer(modifier = Modifier.height(8.dp))

            // Action Row 1: Sets Counter + Total Pieces + Active Switch
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Sets counter increment / decrement
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    IconButton(
                        onClick = { if (sets > 0) sets-- },
                        modifier = Modifier.size(30.dp),
                        colors = IconButtonDefaults.iconButtonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Text("-", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    }

                    Text(
                        text = "$sets sets",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold
                    )

                    IconButton(
                        onClick = { sets++ },
                        modifier = Modifier.size(30.dp),
                        colors = IconButtonDefaults.iconButtonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Add", modifier = Modifier.size(16.dp))
                    }

                    Text(
                        text = "($totalQty pcs)",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(start = 2.dp)
                    )
                }

                // Active / Inactive Switch
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = if (isAvailable) "Active" else "Inactive",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isAvailable) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                    )
                    Switch(
                        checked = isAvailable,
                        onCheckedChange = { isAvailable = it },
                        modifier = Modifier.scale(0.75f)
                    )
                }
            }

            // Action Row 2: Rate Editing (if permitted) & Save Button
            Spacer(modifier = Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (sessionManager.canEditRates()) {
                    OutlinedTextField(
                        value = rateText,
                        onValueChange = { newValue ->
                            if (newValue.isEmpty() || newValue.all { it.isDigit() }) {
                                rateText = newValue
                            }
                        },
                        label = { Text("Base (₹)", fontSize = 9.sp) },
                        modifier = Modifier
                            .width(85.dp)
                            .height(50.dp),
                        textStyle = androidx.compose.ui.text.TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Bold),
                        singleLine = true,
                        shape = RoundedCornerShape(8.dp)
                    )

                    OutlinedTextField(
                        value = revisedRateText,
                        onValueChange = { newValue ->
                            if (newValue.isEmpty() || newValue.all { it.isDigit() }) {
                                revisedRateText = newValue
                            }
                        },
                        label = { Text("Offer (₹)", fontSize = 9.sp, color = Color(0xFFD97706)) },
                        placeholder = { Text("None", fontSize = 9.sp) },
                        modifier = Modifier
                            .width(85.dp)
                            .height(50.dp),
                        textStyle = androidx.compose.ui.text.TextStyle(
                            fontSize = 12.sp, 
                            fontWeight = FontWeight.Bold,
                            color = if (revisedRateText.isNotEmpty()) Color(0xFFD97706) else MaterialTheme.colorScheme.onSurface
                        ),
                        singleLine = true,
                        shape = RoundedCornerShape(8.dp)
                    )
                }

                // Save Button
                Button(
                    onClick = {
                        isUpdating = true
                        isSuccess = false
                        scope.launch {
                            try {
                                val canEdit = sessionManager.canEditRates()
                                val parsedBase = rateText.toIntOrNull() ?: item.rate
                                val parsedRev = if (revisedRateText.isBlank()) null else revisedRateText.toIntOrNull()
                                
                                // Only pass rates if user has permission AND they actually changed
                                val finalRate = if (canEdit && parsedBase != item.rate) parsedBase else null
                                val finalRevised = if (canEdit && parsedRev != item.revised_rate) parsedRev else null

                                val response = apiService.updateStock(
                                    item.id,
                                    StockUpdateRequest(
                                        setsCount = sets, 
                                        isAvailable = isAvailable, 
                                        rate = finalRate,
                                        revisedRate = finalRevised
                                    )
                                )
                                currentRevisedRate = response.revised_rate
                                isSuccess = true
                                Toast.makeText(context, "${item.sku_id} saved successfully", Toast.LENGTH_SHORT).show()
                            } catch (e: Exception) {
                                val msg = e.message ?: "Failed to save ${item.sku_id}"
                                Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
                            } finally {
                                isUpdating = false
                            }
                        }
                    },
                    modifier = Modifier
                        .weight(1f)
                        .height(44.dp),
                    enabled = !isUpdating,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isSuccess) Color(0xFF10B981) else MaterialTheme.colorScheme.primary
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    if (isUpdating) {
                        CircularProgressIndicator(
                            strokeWidth = 2.dp, 
                            color = Color.White,
                            modifier = Modifier.size(16.dp)
                        )
                    } else if (isSuccess) {
                        Icon(Icons.Default.Check, contentDescription = "Saved", modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Saved", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    } else {
                        Text("Save", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }

    if (showZoomDialog) {
        ImageZoomDialog(
            item = item,
            serverUrl = sessionManager.getServerUrl(),
            sessionManager = sessionManager,
            onDismiss = { showZoomDialog = false }
        )
    }
}

@Composable
fun ImageZoomDialog(
    item: SKUItemDto,
    serverUrl: String,
    sessionManager: SessionManager,
    onDismiss: () -> Unit
) {
    var scale by remember { mutableStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }

    val transformState = rememberTransformableState { zoomChange, offsetChange, _ ->
        scale = (scale * zoomChange).coerceIn(1f, 5f)
        if (scale > 1f) {
            offset += offsetChange
        } else {
            offset = Offset.Zero
        }
    }

    val canAccessReal = sessionManager.canAccessRealImages()
    val realImageUrls = remember(item) { item.getFullRealImageUrls(serverUrl) }
    var selectedImageIndex by remember { mutableIntStateOf(0) }

    val currentDisplayUrl = if (selectedImageIndex > 0 && selectedImageIndex <= realImageUrls.size) {
        realImageUrls[selectedImageIndex - 1]
    } else {
        item.getFullImageUrl(serverUrl)
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.95f))
                .clickable { onDismiss() },
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Top Header Bar with SKU Info and Close Button
                Surface(
                    color = Color.Black.copy(alpha = 0.75f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = item.sku_id,
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp
                            )
                            Text(
                                text = "Rate: ₹${item.rate} | Pack: ${item.pieces_per_set} pcs/set" + if (!item.work.isNullOrBlank()) " | ✨ ${item.work}" else "",
                                color = Color.White.copy(alpha = 0.8f),
                                fontSize = 12.sp
                            )
                        }

                        IconButton(
                            onClick = onDismiss,
                            modifier = Modifier
                                .size(36.dp)
                                .background(Color.White.copy(alpha = 0.2f), CircleShape)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Close Zoom",
                                tint = Color.White
                            )
                        }
                    }
                }

                // Selector chips for Catalog vs RAW Real Photos
                if (canAccessReal && realImageUrls.isNotEmpty()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color.Black.copy(alpha = 0.85f))
                            .padding(vertical = 4.dp, horizontal = 12.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        FilterChip(
                            selected = selectedImageIndex == 0,
                            onClick = { 
                                selectedImageIndex = 0
                                scale = 1f
                                offset = Offset.Zero
                            },
                            label = { Text("Catalog Design", fontSize = 11.sp) }
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        realImageUrls.forEachIndexed { idx, _ ->
                            FilterChip(
                                selected = selectedImageIndex == idx + 1,
                                onClick = { 
                                    selectedImageIndex = idx + 1
                                    scale = 1f
                                    offset = Offset.Zero
                                },
                                label = { Text("📷 Real ${idx + 1}", fontSize = 11.sp) }
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                        }
                    }
                }

                // Center Image Area with Gesture Zooming
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .clipToBounds()
                        .pointerInput(Unit) {
                            detectTapGestures(
                                onDoubleTap = {
                                    if (scale > 1f) {
                                        scale = 1f
                                        offset = Offset.Zero
                                    } else {
                                        scale = 2.5f
                                    }
                                }
                            )
                        }
                        .transformable(state = transformState),
                    contentAlignment = Alignment.Center
                ) {
                    AsyncImage(
                        model = ImageRequest.Builder(LocalContext.current)
                            .data(currentDisplayUrl)
                            .crossfade(true)
                            .build(),
                        contentDescription = item.sku_id,
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer(
                                scaleX = scale,
                                scaleY = scale,
                                translationX = offset.x,
                                translationY = offset.y
                            ),
                        contentScale = ContentScale.Fit
                    )
                }

                // Bottom Gesture Tip
                Surface(
                    color = Color.Black.copy(alpha = 0.75f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = if (selectedImageIndex > 0) "Viewing Watermarked Real Photo • Pinch or double-tap to zoom" else "Pinch or double-tap to zoom • Tap to close",
                        color = Color.White.copy(alpha = 0.7f),
                        fontSize = 12.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 10.dp)
                    )
                }
            }
        }
    }
}
